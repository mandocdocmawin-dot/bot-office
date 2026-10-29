const cache = new Map<string, string>()
const imagePath = /\.(gif|webp|png|jpe?g)$/i
const imageTypes = new Set(['image/gif', 'image/webp', 'image/png', 'image/jpeg'])

export function mediaProviderUrl(value: string): URL | undefined {
    try {
        const url = new URL(value)
        const host = url.hostname
        const allowed =
            [
                'giphy.com',
                'www.giphy.com',
                'tenor.com',
                'www.tenor.com',
                'klipy.com',
                'www.klipy.com',
                'cdn.discordapp.com',
                'media.discordapp.net'
            ].includes(host) ||
            /^(?:media\d*|i)\.giphy\.com$/.test(host) ||
            /^(?:media\d*|c)\.tenor\.com$/.test(host) ||
            /^(?:static\d*|media\d*)\.klipy\.com$/.test(host)
        if (allowed && url.protocol === 'https:' && !url.username && !url.password && !url.port) {
            return url
        }
    } catch {
        /* Unsupported or malformed media URL. */
    }
    return undefined
}

export function isMediaUrl(text: string): boolean {
    try {
        const url = new URL(text.trim())
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false
        }
        if (imagePath.test(url.pathname)) {
            return true
        }
        const provider = mediaProviderUrl(url.href)
        if (!provider) {
            return false
        }
        return (
            /\/(gifs|stickers|view)\//.test(provider.pathname) ||
            /^(media\d*|static\d*)\./.test(provider.hostname) ||
            (provider.hostname === 'cdn.discordapp.com' && provider.pathname.startsWith('/attachments/'))
        )
    } catch {
        return false
    }
}

// Validate every redirect and never forward office session cookies upstream.
export async function fetchMediaResponse(rawUrl: string, request: typeof fetch = fetch): Promise<Response> {
    let target = rawUrl
    const signal = AbortSignal.timeout(8000)
    for (let hop = 0; hop <= 3; hop++) {
        const url = mediaProviderUrl(target)
        if (!url) {
            throw new Error('Unsupported media provider')
        }
        const response = await request(url.href, {
            redirect: 'manual',
            signal,
            headers: {
                'User-Agent': 'DiscordOffice/1.0',
                Accept: 'image/gif,image/webp,image/png,image/jpeg,text/html;q=0.5'
            }
        })
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location')
            await response.body?.cancel()
            if (!location) {
                throw new Error('Invalid media redirect')
            }
            target = new URL(location, url).href
            continue
        }
        if (!response.ok) {
            await response.body?.cancel()
            throw new Error('Media provider unavailable')
        }
        return response
    }
    throw new Error('Too many media redirects')
}

export async function readMediaBody(response: Response, limit: number): Promise<Buffer> {
    if (Number(response.headers.get('content-length')) > limit) {
        await response.body?.cancel()
        throw new Error('Media response too large')
    }
    if (!response.body) {
        throw new Error('Empty media response')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        while (true) {
            const result = await reader.read()
            if (result.done) {
                break
            }
            size += result.value.byteLength
            if (size > limit) {
                throw new Error('Media response too large')
            }
            chunks.push(result.value)
        }
    } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
    } finally {
        reader.releaseLock()
    }
    return Buffer.concat(chunks, size)
}

export async function resolveMediaUrl(rawUrl: string, request: typeof fetch = fetch): Promise<string | null> {
    const url = rawUrl.trim()
    const parsed = mediaProviderUrl(url)
    if (!parsed) {
        return null
    }
    if (imagePath.test(parsed.pathname)) {
        return url
    }
    const cached = cache.get(url)
    if (cached) {
        return cached
    }
    // Use the public Giphy id without waiting for a large HTML page.
    if (['giphy.com', 'www.giphy.com'].includes(parsed.hostname) && parsed.pathname.startsWith('/gifs/')) {
        const id = parsed.pathname.replace(/\/$/, '').split('/').at(-1)?.split('-').at(-1)
        if (id && /^[a-zA-Z0-9]{6,}$/.test(id)) {
            return remember(url, `https://media.giphy.com/media/${id}/giphy.gif`)
        }
    }
    if (
        !['klipy.com', 'www.klipy.com', 'tenor.com', 'www.tenor.com', 'giphy.com', 'www.giphy.com'].includes(
            parsed.hostname
        )
    ) {
        return null
    }
    try {
        const response = await fetchMediaResponse(url, request)
        const html = (await readMediaBody(response, 1024 * 1024)).toString('utf8')
        const direct = html.match(
            /https:\/\/(?:static\d*\.klipy\.com|media\d*\.(?:giphy|tenor)\.com)\/[^"\s<>]+\.gif(?:\?[^"\s<>]*)?/i
        )?.[0]
        const og =
            html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ??
            html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i)?.[1]
        const candidate = (direct ?? og)?.replaceAll('&amp;', '&')
        if (candidate && mediaProviderUrl(candidate)) {
            return remember(url, candidate)
        }
    } catch {
        /* The image route reports failure without disrupting the office. */
    }
    return null
}

export async function loadMediaImage(rawUrl: string, request: typeof fetch = fetch) {
    if (!mediaProviderUrl(rawUrl)) {
        throw new Error('Unsupported media provider')
    }
    const target = await resolveMediaUrl(rawUrl, request)
    if (!target) {
        throw new Error('Could not resolve media image')
    }
    const response = await fetchMediaResponse(target, request)
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
    if (!imageTypes.has(type)) {
        await response.body?.cancel()
        throw new Error('Provider did not return an image')
    }
    return { type, body: await readMediaBody(response, 8 * 1024 * 1024) }
}

function remember(key: string, value: string) {
    if (cache.size >= 200) {
        cache.clear()
    }
    cache.set(key, value)
    return value
}
