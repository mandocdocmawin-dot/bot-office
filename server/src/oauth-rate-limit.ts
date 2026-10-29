export interface OAuthCooldown {
    retryAfterSeconds: number
    retrySource: 'discord' | 'fallback'
    responseType: 'json' | 'html' | 'other'
    scope?: 'user' | 'shared' | 'global'
    providerCode?: number
}

// Discord's retry_after values are seconds, including fractional seconds.
// Never return or log its raw response body: it may contain sensitive data.
export async function readOAuthCooldown(response: Response, now: number): Promise<OAuthCooldown> {
    const seconds = (value: unknown): number | undefined => {
        if (typeof value !== 'number' && typeof value !== 'string') {
            return
        }
        if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) {
            return
        }
        const number = Number(value)
        if (Number.isFinite(number) && number >= 0 && number <= 365 * 86_400) {
            return number
        }
    }
    const contentType = response.headers.get('content-type') ?? ''
    const responseType = contentType.includes('json') ? 'json' : contentType.includes('html') ? 'html' : 'other'
    let body: Record<string, unknown> = {}
    if (responseType === 'json') {
        try {
            const parsed: unknown = await response.json()
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                body = parsed as Record<string, unknown>
            }
        } catch {
            /* Header or fallback cooldown still applies. */
        }
    } else {
        await response.body?.cancel().catch(() => {})
    }
    const retryHeader = response.headers.get('retry-after')
    const headerDelay =
        seconds(retryHeader) ?? (retryHeader ? seconds((Date.parse(retryHeader) - now) / 1000) : undefined)
    const delays = [
        headerDelay,
        seconds(body.retry_after),
        seconds(response.headers.get('x-ratelimit-reset-after'))
    ].filter((value): value is number => value !== undefined)
    const rawScope = response.headers.get('x-ratelimit-scope')
    const scope =
        rawScope === 'user' || rawScope === 'shared' || rawScope === 'global'
            ? rawScope
            : body.global === true
              ? 'global'
              : undefined
    return {
        retryAfterSeconds: delays.length > 0 ? Math.max(1, Math.ceil(Math.max(...delays))) : 60,
        retrySource: delays.length > 0 ? 'discord' : 'fallback',
        responseType,
        ...(scope ? { scope } : {}),
        ...(typeof body.code === 'number' && Number.isSafeInteger(body.code) ? { providerCode: body.code } : {})
    }
}

export class OAuthRateLimitError extends Error {
    constructor(public cooldown: OAuthCooldown) {
        super('Discord OAuth is rate limited')
    }
}
