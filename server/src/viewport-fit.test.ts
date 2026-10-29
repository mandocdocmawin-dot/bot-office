import { expect, test } from 'vite-plus/test'
import { fitWorldViewport } from '../../web/src/viewport-fit'
import { corners, project, unproject } from '@office/shared/math'

test('the whole raised office fits between floating controls at desktop, square and phone sizes', () => {
    for (const [width, height] of [[1920, 1080], [1280, 720], [900, 900], [390, 844], [844, 390], [320, 568]]) {
        const fit = fitWorldViewport(width, height)
        // Include elevated back walls and the front platform thickness.
        const envelope = [...corners(0, 0, 1400, 1000, 110), ...corners(0, 0, 1400, 1000, -45)]
        for (const point of envelope) {
            const x = width / 2 + (point.x - fit.centerX) * fit.zoom
            const y = height / 2 + (point.y - fit.centerY) * fit.zoom
            expect(x).toBeGreaterThan(0)
            expect(x).toBeLessThan(width)
            expect(y).toBeGreaterThanOrEqual(fit.top)
            expect(y).toBeLessThanOrEqual(height - fit.bottom)
        }
    }
})

test('the steeper projection preserves click-to-walk world coordinates', () => {
    for (const point of [{ x: 0, y: 0 }, { x: 700, y: 500 }, { x: 1400, y: 1000 }]) {
        const screen = project(point.x, point.y)
        const result = unproject(screen.x, screen.y)
        expect(result.x).toBeCloseTo(point.x, 8)
        expect(result.y).toBeCloseTo(point.y, 8)
    }
})
