import { describe, expect, it } from 'vite-plus/test'
import { isMediaUrl, resolveMediaUrl } from './media.js'

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

    it('resolves klipy url or falls back on error', async () => {
        const res = await resolveMediaUrl('https://klipy.com/gifs/rat-cute-cry')
        expect(res.startsWith('https://')).toBe(true)
    })
})
