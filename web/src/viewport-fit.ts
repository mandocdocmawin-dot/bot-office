import { WORLD_HEIGHT, WORLD_WIDTH } from '@office/shared/math'

// Reserve room for the floating controls, including the second row on phones.
export function fitWorldViewport(width: number, height: number) {
    const top = width <= 760 ? 86 : 34
    const bottom = width <= 1000 ? 150 : 86
    const availableWidth = Math.max(1, width - (width <= 480 ? 24 : 48))
    const availableHeight = Math.max(1, height - top - bottom)
    const zoom = Math.min(availableWidth / WORLD_WIDTH, availableHeight / WORLD_HEIGHT) * 0.98
    return {
        zoom,
        centerX: WORLD_WIDTH / 2 - 25,
        centerY: WORLD_HEIGHT / 2 - 60 + (bottom - top) / (2 * zoom),
        top,
        bottom
    }
}
