import type { Point } from '@office/shared/protocol'
import { PROJECTION_X, PROJECTION_Y } from '@office/shared/math'

const codes: Record<string, string> = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    ArrowUp: 'arrowup',
    ArrowDown: 'arrowdown',
    ArrowLeft: 'arrowleft',
    ArrowRight: 'arrowright'
}
const names = new Set(Object.values(codes))
export function movementKey(event: { code?: string; key: string }): string | undefined {
    if (event.code) {
        return codes[event.code]
    }
    const key = event.key.toLowerCase()
    return names.has(key) ? key : undefined
}

export function movementDirection(keys: ReadonlySet<string>): Point {
    const sx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
    const sy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))
    // Invert the map's projection before normalizing world speed. A screen
    // diagonal then follows the keys at 45 degrees instead of drifting sideways.
    const dx = sx / PROJECTION_X + sy / PROJECTION_Y
    const dy = sy / PROJECTION_Y - sx / PROJECTION_X
    const length = Math.hypot(dx, dy)
    return length ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }
}

export class KeyboardMovement {
    private keys = new Set<string>()
    private previous = { x: 0, y: 0 }
    constructor(private send: (direction: Point) => void) {}
    press(key: string) {
        this.keys.add(key)
        this.dispatch()
    }
    release(key: string) {
        this.keys.delete(key)
        this.dispatch()
    }
    clear() {
        this.keys.clear()
        this.dispatch()
    }
    heartbeat() {
        this.dispatch(true)
    }
    private dispatch(heartbeat = false) {
        const direction = movementDirection(this.keys)
        if (
            direction.x === this.previous.x &&
            direction.y === this.previous.y &&
            !(heartbeat && (direction.x || direction.y))
        ) {
            return
        }
        this.previous = direction
        this.send(direction)
    }
}
