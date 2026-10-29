// Keyboard, pointer and chat input share one wake-up budget. A long pasted
// or rapidly typed GIF link must not flood the movement WebSocket.
export function createActivitySignal(send: () => void, now = () => Date.now()) {
    let last = -Infinity
    return () => {
        const time = now()
        if (time - last < 900) return
        last = time
        send()
    }
}
