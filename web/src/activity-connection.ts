import type { Identity } from '@office/shared/protocol'

// This screen never links to browser OAuth. Discord handles authorization in the SDK.
export async function connectActivity(
    root: HTMLElement,
    connect: () => Promise<Identity>,
    enter: (user: Identity) => void,
    cooldownType: new (...args: never[]) => Error & { retryAt: number }
) {
    root.innerHTML = `<main class="activity-connection"><section aria-labelledby="activity-heading"><div class="brand">discord office</div><h1 id="activity-heading">Opening your office</h1><p id="activity-message" role="status">Connecting through Discord. Your office will open automatically.</p><p id="activity-countdown" role="timer" aria-live="off" hidden></p><button id="activity-retry" class="text-button" hidden>Retry connection</button></section></main>`
    const heading = root.querySelector<HTMLElement>('#activity-heading')!
    const message = root.querySelector<HTMLElement>('#activity-message')!
    const countdown = root.querySelector<HTMLElement>('#activity-countdown')!
    const retry = root.querySelector<HTMLButtonElement>('#activity-retry')!
    try {
        const user = await connect()
        if (heading.isConnected) {
            enter(user)
        }
    } catch (error) {
        if (!heading.isConnected) {
            return
        }
        if (error instanceof cooldownType) {
            heading.textContent = 'Waiting for Discord'
            message.textContent = `Discord temporarily limited connections. We’ll reconnect automatically after ${new Date(error.retryAt).toLocaleTimeString()}. You can leave this Activity open.`
            countdown.hidden = false
            const tick = () => {
                if (!heading.isConnected) {
                    return
                }
                const seconds = Math.max(0, Math.ceil((error.retryAt - Date.now()) / 1000))
                countdown.textContent = `Reconnecting in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                if (seconds === 0) {
                    void connectActivity(root, connect, enter, cooldownType)
                    return
                }
                window.setTimeout(tick, 1000)
            }
            tick()
        } else {
            heading.textContent = 'Couldn’t open the office'
            message.textContent =
                error instanceof Error
                    ? error.message
                    : 'Discord is unavailable. Retry the connection or close and reopen this Activity.'
            retry.hidden = false
            retry.onclick = () => {
                retry.disabled = true
                void connectActivity(root, connect, enter, cooldownType)
            }
        }
    }
}
