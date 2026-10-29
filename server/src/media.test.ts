import { describe, expect, it, vi } from 'vite-plus/test'
import {
    fetchMediaResponse,
    isMediaUrl,
    loadMediaImage,
    mediaProviderUrl,
    readMediaBody,
    resolveMediaUrl
} from './media.js'

describe('media resolution', () => {
    it('detects media URLs correctly', () => {
        expect(isMediaUrl('hello world')).toBe(false)
        expect(isMediaUrl('https://example.com/page')).toBe(false)
        expect(isMediaUrl('https://example.com/cat.gif')).toBe(true)
        expect(isMediaUrl('https://example.com/cat.gif?width=100')).toBe(true)
        expect(isMediaUrl('https://klipy.com/gifs/rat-cute-cry')).toBe(true)
        expect(isMediaUrl('https://giphy.com/gifs/cat-cute-123')).toBe(true)
        expect(isMediaUrl('https://tenor.com/view/happy-cat-123')).toBe(true)
        expect(isMediaUrl('https://media.tenor.com/something/cat.gif')).toBe(true)
    })

    it('returns direct image URLs untouched', async () => {
        const direct = 'https://media.tenor.com/test.gif'
        const resolved = await resolveMediaUrl(direct)
        expect(resolved).toBe(direct)
    })

    it('resolves the reported Giphy link without downloading a page', async () => {
        const request = vi.fn<typeof fetch>()
        const res = await resolveMediaUrl('https://giphy.com/gifs/link-the-legend-of-zelda-NVBR6cLvUjV9C', request)
        expect(res).toBe('https://media.giphy.com/media/NVBR6cLvUjV9C/giphy.gif')
        expect(request).not.toHaveBeenCalled()
    })

    it('resolves Tenor and Klipy metadata to an allowed image', async () => {
        for (const [page, image] of [
            ['https://tenor.com/view/test-image-123456', 'https://media.tenor.com/test/cat.gif'],
            ['https://klipy.com/gifs/test-proxy-image', 'https://static.klipy.com/test/cat.gif']
        ]) {
            const request = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(`<meta property="og:image" content="${image}">`))
            expect(await resolveMediaUrl(page, request)).toBe(image)
        }
    })

    it('returns null when page HTML snippet has no media image', async () => {
        const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>no image here</html>'))
        expect(await resolveMediaUrl('https://tenor.com/view/empty-12345', request)).toBeNull()
    })

    it('returns GIF bytes and MIME type without forwarding office cookies', async () => {
        const gif = Buffer.from('GIF89a')
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(gif, { headers: { 'Content-Type': 'image/gif' } }))
        const image = await loadMediaImage('https://media.giphy.com/media/test/giphy.gif', request)
        expect(image.type).toBe('image/gif')
        expect(image.body).toEqual(gif)
        expect(new Headers(request.mock.calls[0][1]?.headers).has('cookie')).toBe(false)
        expect(request.mock.calls[0][1]?.redirect).toBe('manual')
    })

    it('rejects private, disguised and unsupported URLs before a network request', async () => {
        const request = vi.fn<typeof fetch>()
        for (const url of [
            'http://127.0.0.1/a.gif',
            'https://[::1]/a.gif',
            'https://evil.example/media.giphy.com/a.gif',
            'https://media.giphy.com.evil.example/a.gif',
            'https://user:pass@media.giphy.com/a.gif',
            'https://media.giphy.com:8080/a.gif'
        ]) {
            expect(mediaProviderUrl(url)).toBeUndefined()
            await expect(loadMediaImage(url, request)).rejects.toThrow()
        }
        expect(request).not.toHaveBeenCalled()
    })

    it('checks redirect targets before following them', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }))
        await expect(fetchMediaResponse('https://media.giphy.com/a.gif', request)).rejects.toThrow('Unsupported')
        expect(request).toHaveBeenCalledTimes(1)
    })

    it('loads Discord picker image proxies but rejects lookalike hosts', async () => {
        const proxy = 'https://images-ext-1.discordapp.net/external/hash/https/media.tenor.com/test/tenor.gif'
        expect(mediaProviderUrl(proxy)).toBeDefined()
        expect(mediaProviderUrl('https://images-ext-1.discordapp.net.evil.example/test.gif')).toBeUndefined()
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('GIF89a', { headers: { 'Content-Type': 'image/gif' } }))
        expect((await loadMediaImage(proxy, request)).body.toString()).toBe('GIF89a')
    })

    it('rejects HTML and large responses instead of serving them as images', async () => {
        const html = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('<html>page</html>', { headers: { 'Content-Type': 'text/html' } }))
        await expect(loadMediaImage('https://media.giphy.com/a.gif', html)).rejects.toThrow('not return an image')
        await expect(
            readMediaBody(new Response('abc', { headers: { 'Content-Length': '9000000' } }), 8_000_000)
        ).rejects.toThrow('too large')
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(40))
                controller.enqueue(new Uint8Array(40))
                controller.close()
            }
        })
        await expect(readMediaBody(new Response(stream), 64)).rejects.toThrow('too large')
    })
})
