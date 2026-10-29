import { afterAll, beforeAll, expect, test, vi } from 'vite-plus/test'
import { createOfficeServer } from './app.js'
import { loadConfig } from './config.js'

const source = `/* same prefix for cache validation */${'const value = 1;'.repeat(40)}`

vi.mock('node:fs/promises', async (importOriginal) => {
    const original = await importOriginal<typeof import('node:fs/promises')>()
    return {
        ...original,
        readFile: vi.fn(async (...args: Parameters<typeof original.readFile>) => {
            const path = String(args[0]).replaceAll('\\', '/')
            if (path.endsWith('/assets/cache-test-12345678.js') || path.endsWith('/cache-test.js')) {
                return Buffer.from(`/* same prefix for cache validation */${'const value = 1;'.repeat(40)}`)
            }
            if (path.endsWith('/assets/cache-next-12345678.js')) {
                return Buffer.from(`/* same prefix for cache validation */${'const value = 2;'.repeat(40)}`)
            }
            return original.readFile(...args)
        })
    }
})

const app = createOfficeServer(loadConfig(), {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    guildId: '',
    secret: 'static-asset-test-secret',
    webUrl: 'http://localhost',
    mock: false
})
let base = ''

beforeAll(async () => {
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
    const address = app.server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Missing test server address')
    }
    base = `http://127.0.0.1:${address.port}`
})
afterAll(() => app.close())

test('gzip and identity responses vary correctly and respect gzip;q=0', async () => {
    const compressed = await fetch(`${base}/assets/cache-test-12345678.js`, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(compressed.headers.get('content-encoding')).toBe('gzip')
    expect(compressed.headers.get('vary')).toBe('Accept-Encoding')
    expect(await compressed.text()).toBe(source)
    const raw = await fetch(`${base}/assets/cache-test-12345678.js`, { headers: { 'Accept-Encoding': 'gzip;q=0' } })
    expect(raw.headers.get('content-encoding')).toBeNull()
    expect(await raw.text()).toBe(source)
})

test('conditional requests retain caching metadata and HEAD sends no body', async () => {
    const head = await fetch(`${base}/assets/cache-test-12345678.js`, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'identity' }
    })
    expect(await head.text()).toBe('')
    expect(Number(head.headers.get('content-length'))).toBe(Buffer.byteLength(source))
    const etag = head.headers.get('etag')!
    const fresh = await fetch(`${base}/assets/cache-test-12345678.js`, {
        headers: { 'If-None-Match': `"old", ${etag}` }
    })
    expect(fresh.status).toBe(304)
    expect(fresh.headers.get('etag')).toBe(etag)
    expect(fresh.headers.get('vary')).toBe('Accept-Encoding')
    expect(fresh.headers.get('cache-control')).toContain('immutable')
})

test('ETags distinguish equal-length files with identical prefixes', async () => {
    const first = await fetch(`${base}/assets/cache-test-12345678.js`, { method: 'HEAD' })
    const next = await fetch(`${base}/assets/cache-next-12345678.js`, { method: 'HEAD' })
    expect(first.headers.get('etag')).not.toBe(next.headers.get('etag'))
})

test('files without a content hash require revalidation', async () => {
    const response = await fetch(`${base}/cache-test.js`)
    expect(response.headers.get('cache-control')).toBe('no-cache')
    await response.text()
})
