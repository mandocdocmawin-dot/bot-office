import { describe, expect, test } from 'vite-plus/test'
import { KeyboardMovement, movementDirection, movementKey } from '../../web/src/keyboard-movement'
import type { Point } from '@office/shared/protocol'
import { PROJECTION_X, PROJECTION_Y } from '@office/shared/math'

describe('keyboard-movement', () => {
    test('press, turn and release dispatch immediately without waiting for a heartbeat', () => {
        const sent: Point[] = []
        const controls = new KeyboardMovement((direction) => sent.push(direction))
        controls.press('d')
        expect(sent).toEqual([movementDirection(new Set(['d']))])
        controls.press('w')
        expect(sent.at(-1)).toEqual(movementDirection(new Set(['d', 'w'])))
        controls.release('d')
        expect(sent.at(-1)).toEqual(movementDirection(new Set(['w'])))
        controls.release('w')
        expect(sent.at(-1)).toEqual({ x: 0, y: 0 })
        expect(sent.length).toBe(4)
    })

    test('held input renews its lease; repeats, duplicate bindings and idle do not flood', () => {
        const sent: Point[] = []
        const controls = new KeyboardMovement((direction) => sent.push(direction))
        controls.heartbeat()
        expect(sent.length).toBe(0)
        controls.press('w')
        controls.press('w')
        controls.press('arrowup')
        expect(sent.length).toBe(1)
        controls.release('w')
        expect(sent.length).toBe(1)
        controls.heartbeat()
        expect(sent.length).toBe(2)
        controls.clear()
        expect(sent.at(-1)).toEqual({ x: 0, y: 0 })
        const count = sent.length
        // A delayed key release after click-to-move must not send another stop.
        controls.release('arrowup')
        controls.heartbeat()
        controls.clear()
        expect(sent.length).toBe(count)
    })

    test('all eight directions match screen axes and keep world speed normalized', () => {
        for (const [keys, sx, sy] of [
            [['d'], 1, 0],
            [['a'], -1, 0],
            [['s'], 0, 1],
            [['w'], 0, -1],
            [['d', 'w'], 1, -1],
            [['d', 's'], 1, 1],
            [['a', 'w'], -1, -1],
            [['a', 's'], -1, 1]
        ] as [string[], number, number][]) {
            const { x, y } = movementDirection(new Set(keys))
            expect(Math.abs(Math.hypot(x, y) - 1)).toBeLessThan(1e-12)
            const screenX = PROJECTION_X * (x - y)
            const screenY = PROJECTION_Y * (x + y)
            expect(Math.abs(screenX * sy - screenY * sx)).toBeLessThan(1e-12)
            expect(screenX * sx + screenY * sy).toBeGreaterThan(0)
        }
        expect(movementDirection(new Set(['w', 's', 'a', 'd']))).toEqual({ x: 0, y: 0 })
        expect(movementDirection(new Set(['w']))).toEqual(movementDirection(new Set(['arrowup'])))
    })

    test('physical key codes survive Shift and keyboard layouts, with a key fallback', () => {
        expect(movementKey({ code: 'KeyW', key: 'W' })).toBe('w')
        expect(movementKey({ code: 'KeyW', key: 'z' })).toBe('w')
        expect(movementKey({ code: 'KeyZ', key: 'w' })).toBeUndefined()
        expect(movementKey({ key: 'ArrowLeft' })).toBe('arrowleft')
        expect(movementKey({ key: 'W' })).toBe('w')
        expect(movementKey({ code: 'Enter', key: 'Enter' })).toBeUndefined()
    })
})
