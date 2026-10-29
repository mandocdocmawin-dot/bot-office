import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { Auth } from './auth.js'
import type { AuthOptions } from './auth.js'
import { Office } from './office.js'
import { ROOT } from './config.js'
import type { Config } from './config.js'
import { startMock } from './mock.js'
import { GameLoop } from './loop.js'
import { isMediaUrl, resolveMediaUrl } from './media.js'
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
        if (p.type === 'chat' && typeof p.text === 'string' && [...p.text].length <= 80) {
            return { type: 'chat', text: p.text }
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
    private tokens = 50
    private last = Date.now()
    take() {
        const now = Date.now()
        this.tokens = Math.min(50, this.tokens + (now - this.last) * 0.03)
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
            if (socket.bufferedAmount > 500_000) {
                socket.close(4008, 'Client too slow')
            } else {
                socket.send(JSON.stringify(packet))
            }
        }
    }
    const auth = new Auth(options, request)
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
            const data = await readFile(file)
            res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' })
            res.end(req.method === 'HEAD' ? undefined : data)
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
            ws.on('error', () => {})
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
                    ws.close(1008, 'Invalid input')
                    return
                }
                office.input(user.id, packet)
            })
            ws.on('close', () => {
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
            const packet: Packet = { type: 'state', at: Date.now(), state: office.snapshot() }
            for (const socket of connections.values()) {
                send(socket, packet)
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
