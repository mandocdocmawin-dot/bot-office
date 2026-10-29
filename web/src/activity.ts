import { DiscordSDK } from '@discord/embedded-app-sdk'
import type { Identity } from '@office/shared/protocol'

export const inActivity =
    location.hostname.endsWith('.discordsays.com') && new URLSearchParams(location.search).has('frame_id')
let sdk: DiscordSDK | undefined

export class ActivityCooldownError extends Error {
    readonly retryAt: number
    constructor(seconds: number) {
        super('Discord is temporarily limiting connections.')
        this.retryAt = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000
    }
}

export async function activityLogin(): Promise<Identity> {
    const configResponse = await fetch('/api/activity/config')
    if (!configResponse.ok) {
        throw new Error('The office server is unavailable. Try again shortly.')
    }
    const config = (await configResponse.json()) as { clientId: string; loginRetryAfterSeconds: number }
    if (location.hostname !== `${config.clientId}.discordsays.com`) {
        throw new Error('The Activity application ID does not match the office server.')
    }
    sdk ??= new DiscordSDK(config.clientId)
    await sdk.ready()
    const resumed = await fetch('/api/activity/resume', { method: 'POST', credentials: 'include' })
    if (resumed.ok) {
        const previous = (await resumed.json()) as { user: Identity; access_token: string }
        try {
            const authenticated = await sdk.commands.authenticate({ access_token: previous.access_token })
            if (
                authenticated?.user.id === previous.user.id &&
                (authenticated.scopes.includes('rpc.voice.read') || config.loginRetryAfterSeconds > 0)
            ) {
                return previous.user
            }
        } catch {
            /* A revoked token must complete a fresh authorization below. */
        }
    } else if (![401, 404].includes(resumed.status)) {
        throw new Error('The office session could not be restored. Retry the connection shortly.')
    }
    if (config.loginRetryAfterSeconds > 0) {
        throw new ActivityCooldownError(config.loginRetryAfterSeconds)
    }
    // Voice state access supplies speaking events without a bot UDP connection.
    // Apps without this scope enabled can still open the office using bot signals.
    const authorization = {
        client_id: config.clientId,
        response_type: 'code' as const,
        state: '',
        prompt: 'none' as const
    }
    const { code } = await sdk.commands
        .authorize({ ...authorization, scope: ['identify', 'guilds', 'rpc.voice.read'] })
        .catch(() => sdk!.commands.authorize({ ...authorization, scope: ['identify', 'guilds'] }))
    const response = await fetch('/api/activity/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    })
    const result = (await response.json()) as {
        user: Identity
        access_token: string
        error?: string
        retryAfterSeconds?: number
    }
    if (!response.ok) {
        if (result.error === 'not_member') {
            throw new Error('You must be a member of the office Discord server.')
        }
        if (result.error === 'rate_limited') {
            throw new ActivityCooldownError(result.retryAfterSeconds ?? 60)
        }
        throw new Error(
            'The office could not connect to Discord. Check the server application settings, then retry the connection.'
        )
    }
    const authenticated = await sdk.commands.authenticate({ access_token: result.access_token })
    if (!authenticated || authenticated.user.id !== result.user.id) {
        throw new Error('Discord could not authenticate this Activity. Please relaunch it.')
    }
    // No OAuth tokens in localStorage, URLs or logs. The office uses an HttpOnly session.
    return result.user
}

const avatarCache = new Map<string, string>()
export function activityAvatar(avatar: string | null) {
    if (!inActivity || !avatar || !avatar.startsWith('https://cdn.discordapp.com/')) {
        return avatar
    }
    let cached = avatarCache.get(avatar)
    if (!cached) {
        cached = avatar.replace('https://cdn.discordapp.com/', '/discord-cdn/')
        avatarCache.set(avatar, cached)
    }
    return cached
}

export async function watchActivitySpeaking(onSpeaking: (id: string, active: boolean, channelId: string) => void) {
    const client = sdk
    if (!client?.channelId) {
        throw new Error('No Discord Activity voice channel.')
    }
    const { channelId } = client
    const args = { channel_id: channelId }
    const start = (event: { user_id: string; channel_id?: string }) => {
        if (!event.channel_id || event.channel_id === channelId) {
            onSpeaking(event.user_id, true, channelId)
        }
    }
    const stop = (event: { user_id: string; channel_id?: string }) => {
        if (!event.channel_id || event.channel_id === channelId) {
            onSpeaking(event.user_id, false, channelId)
        }
    }
    const cleanup = () =>
        Promise.allSettled([
            client.unsubscribe('SPEAKING_START', start, args),
            client.unsubscribe('SPEAKING_STOP', stop, args)
        ])
    // Settle both before cleanup so a late successful subscription cannot leak.
    const results = await Promise.allSettled([
        client.subscribe('SPEAKING_START', start, args),
        client.subscribe('SPEAKING_STOP', stop, args)
    ])
    if (results.some((result) => result.status === 'rejected')) {
        await cleanup()
        throw new Error('Discord speaking events unavailable.')
    }
    return cleanup
}
