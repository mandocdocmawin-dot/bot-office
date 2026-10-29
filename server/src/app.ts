import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'
import { WebSocket, WebSocketServer } from 'ws'
import { Auth } from './auth.js'
import type { AuthOptions } from './auth.js'
import { Office } from './office.js'
import { ROOT } from './config.js'
import type { Config } from './config.js'
import { startMock } from './mock.js'
import { GameLoop } from './loop.js'
import { isMediaUrl, loadMediaImage, mediaProviderUrl, resolveMediaUrl } from './media.js'
import type { ClientPacket, Member, Packet } from './protocol.js'

export function parsePacket(raw: string): ClientPacket | undefined {
    try {
        const p = JSON.parse(raw)
        if (!p || typeof p !== 'object') {
            return
        }
        if (
            p.type === 'input' &&
            Number.isFinite(p.dx) &&
            Number.isFinite(p.dy) &&
            Math.abs(p.dx) <= 1 &&
            Math.abs(p.dy) <= 1
        ) {
            return { type: 'input', dx: p.dx, dy: p.dy }
        }
        if (
            p.type === 'move_to' &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.x >= 0 &&
            p.x <= 1400 &&
            p.y >= 0 &&
            p.y <= 1000
        ) {
            return { type: 'move_to', x: p.x, y: p.y }
        }
        if (p.type === 'chat' && typeof p.text === 'string') {
            // Match the room chat UI: links can be longer than text previews.
            const limit = /^https?:\/\/\S+$/i.test(p.text.trim()) ? 500 : 80
            if ([...p.text].length <= limit) {
                return { type: 'chat', text: p.text }
            }
        }
        if (p.type === 'emote' && Number.isInteger(p.index) && p.index >= 0 && p.index < 5) {
            return { type: 'emote', index: p.index }
        }
        if (p.type === 'wake') {
            return { type: 'wake' }
        }
    } catch {
        /* Malformed payloads are rejected without logging message contents. */
    }
}
export class RateLimit {
    private tokens = 75
    private last = Date.now()
    take() {
        const now = Date.now()
        this.tokens = Math.min(75, this.tokens + (now - this.last) * 0.035)
        this.last = now
        if (this.tokens < 1) {
            return false
        }
        this.tokens--
        return true
    }
}
export function createOfficeServer(config: Config, options: AuthOptions, request: typeof fetch = fetch) {
    const connections = new Map<string, WebSocket>()
    const disconnected = new Map<string, { player: Member; expires: number }>()
    const send = (socket: WebSocket, packet: Packet) => {
        if (socket.readyState === WebSocket.OPEN) {
            if (socket.bufferedAmount > 1_500_000) {
                socket.close(4008, 'Client too slow')
            } else {
                socket.send(JSON.stringify(packet))
            }
        }
    }
    const auth = new Auth(options, request)
    const mediaLoads = new Map<string, ReturnType<typeof loadMediaImage>>()
    const office = new Office(config, options.mock ? 'mock' : 'multiplayer', async (id, room, text) => {
        let broadcastText = text
        if (isMediaUrl(text)) {
            broadcastText = await resolveMediaUrl(text)
        }
        for (const [playerId, socket] of connections) {
            if (office.members.get(playerId)?.room === room) {
                send(socket, {
                    type: 'bubble',
                    memberId: id,
                    room,
                    text: broadcastText,
                    duration: config.bubble_duration_ms
                })
            }
        }
    })
    auth.onInvalidate = (id) => {
        disconnected.delete(id)
        connections.get(id)?.close(4001, 'Session ended. Please sign in again.')
    }
    const webRoot = resolve(ROOT, 'web/dist')
    const staticCache = new Map<
        string,
        { body: Buffer; gzip?: Buffer; type: string; etag: string; immutable: boolean }
    >()
    const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png'
    }
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://localhost')
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.setHeader('Referrer-Policy', 'no-referrer')
            if (url.pathname === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                    JSON.stringify({
                        ready: true,
                        mode: office.mode,
                        discord: office.discord,
                        voiceMonitor: office.voiceMonitor
                    })
                )
                return
            }
            if (url.pathname === '/api/media/resolve') {
                const target = url.searchParams.get('url')
                if (!target) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Missing url parameter' }))
                    return
                }
                const resolved = await resolveMediaUrl(target)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ url: resolved }))
                return
            }
            if (url.pathname === '/api/media/image') {
                res.setHeader('Cache-Control', 'no-store')
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    res.writeHead(405)
                    res.end()
                    return
                }
                if (!auth.session(req)) {
                    res.writeHead(401)
                    res.end()
                    return
                }
                const target = url.searchParams.get('url')
                if (!target || target.length > 2000 || !mediaProviderUrl(target)) {
                    res.writeHead(400)
                    res.end()
                    return
                }
                let loading = mediaLoads.get(target)
                if (!loading) {
                    if (mediaLoads.size >= 4) {
                        res.writeHead(503)
                        res.end()
                        return
                    }
                    loading = loadMediaImage(target)
                    mediaLoads.set(target, loading)
                    // Viewers of the same bubble share its in-flight download.
                    void loading.finally(() => mediaLoads.delete(target)).catch(() => {})
                }
                try {
                    const image = await loading
                    res.writeHead(200, {
                        'Content-Type': image.type,
                        'Content-Length': image.body.byteLength,
                        'Cache-Control': 'private, max-age=300'
                    })
                    res.end(req.method === 'HEAD' ? undefined : image.body)
                } catch {
                    console.warn('[office] media_proxy_failed')
                    res.writeHead(502)
                    res.end()
                }
                return
            }
            if (await auth.handle(req, res, url)) {
                return
            }
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405)
                res.end()
                return
            }
            const file = resolve(webRoot, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`)
            if (!file.startsWith(webRoot + sep)) {
                res.writeHead(403)
                res.end()
                return
            }
            let cached = staticCache.get(file)
            if (!cached) {
                const data = await readFile(file)
                const type = mime[extname(file)] ?? 'application/octet-stream'
                const immutable = file.startsWith(resolve(webRoot, 'assets') + sep) && /-[\w-]{8,}\.[\w]+$/.test(file)
                let gzip: Buffer | undefined
                if (
                    data.length > 256 &&
                    (type.startsWith('text/') ||
                        type.includes('javascript') ||
                        type.includes('json') ||
                        type.includes('css') ||
                        type.includes('svg'))
                ) {
                    try {
                        gzip = gzipSync(data, { level: 6 })
                    } catch {
                        /* Ignore compression errors and fallback to raw buffer */
                    }
                }
                const etag = `W/"${createHash('sha256').update(data).digest('hex')}"`
                cached = { body: data, gzip, type, etag, immutable }
                staticCache.set(file, cached)
            }
            const cacheHeaders = {
                ETag: cached.etag,
                Vary: 'Accept-Encoding',
                'Cache-Control': cached.immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
            }
            const validators = req.headers['if-none-match']?.split(',').map((value) => value.trim()) ?? []
            if (validators.some((value) => value === '*' || value.replace(/^W\//, '') === cached.etag.replace(/^W\//, ''))) {
                res.writeHead(304, cacheHeaders)
                res.end()
                return
            }
            const acceptGzip = Boolean(cached.gzip && req.headers['accept-encoding']?.split(',').some((value) => {
                const [encoding, ...parameters] = value.trim().toLowerCase().split(';')
                const quality = parameters.find((parameter) => parameter.trim().startsWith('q='))
                return encoding === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0)
            }))
            const body = acceptGzip && cached.gzip ? cached.gzip : cached.body
            const headers: Record<string, string | number> = {
                'Content-Type': cached.type,
                'Content-Length': body.length,
                ...cacheHeaders
            }
            if (acceptGzip && cached.gzip) {
                headers['Content-Encoding'] = 'gzip'
            }
            res.writeHead(200, headers)
            res.end(req.method === 'HEAD' ? undefined : body)
        } catch {
            if (!res.headersSent) {
                res.writeHead(404)
            }
            res.end('Office page not found. Run npm run build, or use the Vite client on port 5173.')
        }
    })
    const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 })
    server.on('upgrade', (req, socket, head) => {
        const user = auth.session(req)
        if (req.url !== '/ws' || !user || !auth.allowedOrigin(req.headers.origin)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
            socket.destroy()
            return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            const old = connections.get(user.id)
            connections.set(user.id, ws)
            old?.close(4000, 'This account opened another tab.')
            const saved = disconnected.get(user.id)
            disconnected.delete(user.id)
            office.join(user, saved && saved.expires > Date.now() ? saved.player : undefined)
            send(ws, { type: 'snapshot', selfId: user.id, state: office.snapshot(), at: Date.now() })
            const rate = new RateLimit()
            let alive = true
            ws.on('pong', () => {
                alive = true
            })
            ws.on('error', () => console.warn('[office] websocket_error'))
            ws.on('message', (data, binary) => {
                if (connections.get(user.id) !== ws) {
                    return
                }
                if (!rate.take()) {
                    ws.close(4008, 'Too many messages.')
                    return
                }
                if (binary) {
                    ws.close(1003, 'Text packets only')
                    return
                }
                const packet = parsePacket(data.toString())
                if (!packet) {
                    // An oversized chat is recoverable input, not a reason to
                    // disconnect someone from the office and their controls.
                    try {
                        const rejected = JSON.parse(data.toString())
                        if (rejected?.type === 'chat' && typeof rejected.text === 'string') {
                            send(ws, {
                                type: 'error',
                                message: 'Message too long. Use up to 80 characters for text or 500 for a single link.'
                            })
                            return
                        }
                    } catch {
                        /* Invalid non-chat packets retain the protocol close below. */
                    }
                    ws.close(1008, 'Invalid input')
                    return
                }
                office.input(user.id, packet)
            })
            ws.on('close', (code) => {
                if (code !== 1000 && code !== 1005) {
                    console.warn('[office] websocket_closed', { code })
                }
                clearInterval(heartbeat)
                if (connections.get(user.id) !== ws) {
                    return
                }
                connections.delete(user.id)
                const player = office.leave(user.id)
                if (player && auth.session(req)) {
                    disconnected.set(user.id, {
                        player: {
                            id: player.id,
                            username: player.username,
                            avatar: player.avatar,
                            x: player.x,
                            y: player.y,
                            room: player.room,
                            sleeping: player.sleeping,
                            moving: false
                        },
                        expires: Date.now() + 60_000
                    })
                }
            })
            const heartbeat = setInterval(() => {
                if (!auth.session(req)) {
                    ws.close(4001, 'Session expired. Please sign in again.')
                    return
                }
                if (!alive) {
                    ws.terminate()
                    return
                }
                alive = false
                ws.ping()
            }, 15_000)
        })
    })
    const stopMock = options.mock ? startMock(office) : undefined
    const loop = new GameLoop(
        config.tick_rate,
        (dt) => office.tick(dt),
        () => {
            if (connections.size === 0) {
                return
            }
            const raw = JSON.stringify({ type: 'state', at: Date.now(), state: office.snapshot() })
            for (const socket of connections.values()) {
                if (socket.readyState === WebSocket.OPEN) {
                    if (socket.bufferedAmount > 1_500_000) {
                        socket.close(4008, 'Client too slow')
                    } else if (socket.bufferedAmount > 300_000) {
                        // Drop intermediate snapshot when client TCP buffer is saturated to allow it to catch up
                        continue
                    } else {
                        socket.send(raw)
                    }
                }
            }
        }
    )
    loop.start()
    const cleanup = setInterval(() => {
        auth.sweep()
        for (const [id, saved] of disconnected) {
            if (saved.expires < Date.now()) {
                disconnected.delete(id)
            }
        }
    }, 30_000)
    async function close() {
        stopMock?.()
        loop.stop()
        clearInterval(cleanup)
        for (const socket of connections.values()) {
            socket.terminate()
        }
        await new Promise<void>((resolve) => wss.close(() => resolve()))
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    return { server, wss, auth, office, close }
}
