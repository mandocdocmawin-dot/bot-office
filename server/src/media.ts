const cache = new Map<string, string>()

export function isMediaUrl(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return false
    }
    if (/\.(gif|webp|png|jpe?g)(\?.*)?$/i.test(trimmed)) {
        return true
    }
    if (/klipy\.com\/(gifs|stickers)\//i.test(trimmed)) {
        return true
    }
    if (/giphy\.com\/gifs\//i.test(trimmed)) {
        return true
    }
    if (/tenor\.com\/view\//i.test(trimmed)) {
        return true
    }
    if (/(static|media)[0-9]*\.(klipy|giphy|tenor)\.com\//i.test(trimmed)) {
        return true
    }
    if (/cdn\.discordapp\.com\/attachments\//i.test(trimmed)) {
        return true
    }
    return false
}

export async function resolveMediaUrl(rawUrl: string): Promise<string> {
    const url = rawUrl.trim()
    if (/\.(gif|webp|png|jpe?g)(\?.*)?$/i.test(url)) {
        return url
    }
    const cached = cache.get(url)
    if (cached) {
        return cached
    }
    try {
        if (/klipy\.com\/(gifs|stickers)\//i.test(url)) {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discord.app)'
                },
                signal: AbortSignal.timeout(3500)
            })
            if (res.ok) {
                const html = await res.text()
                const preload = html.match(/<link[^>]+as="image"[^>]+href="([^"]+\.gif)"/i)
                if (preload?.[1]) {
                    remember(url, preload[1])
                    return preload[1]
                }
                const directGif = html.match(/https:\/\/static[0-9]*\.klipy\.com\/[^"]+\.gif/i)
                if (directGif?.[0]) {
                    remember(url, directGif[0])
                    return directGif[0]
                }
                const og =
                    html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                    html.match(/content="([^"]+)"\s+property="og:image"/i)
                if (og?.[1]) {
                    remember(url, og[1])
                    return og[1]
                }
            }
        } else if (/giphy\.com\/gifs\//i.test(url)) {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discord.app)'
                },
                signal: AbortSignal.timeout(3500)
            })
            if (res.ok) {
                const html = await res.text()
                const gif = html.match(/https:\/\/media[0-9]*\.giphy\.com\/media\/[^"]+\/giphy\.gif/i)
                if (gif?.[0]) {
                    remember(url, gif[0])
                    return gif[0]
                }
                const og =
                    html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                    html.match(/content="([^"]+)"\s+property="og:image"/i)
                if (og?.[1]) {
                    remember(url, og[1])
                    return og[1]
                }
            }
        }
    } catch {
        /* Fall back to raw url on network error or timeout */
    }
    return url
}

function remember(key: string, value: string) {
    if (cache.size > 200) {
        cache.clear()
    }
    cache.set(key, value)
}
