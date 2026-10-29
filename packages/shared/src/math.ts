import type { Point } from './protocol.js'

export const WORLD_WIDTH = 2200
export const WORLD_HEIGHT = 1210

export const project = (x: number, y: number, z = 0): Point => ({
    x: 900 + (x - y) * 0.86,
    y: 60 + (x + y) * 0.43 - z
})

export const unproject = (sx: number, sy: number): Point => ({
    x: ((sx - 900) / 0.86 + (sy - 60) / 0.43) / 2,
    y: ((sy - 60) / 0.43 - (sx - 900) / 0.86) / 2
})

export function corners(x: number, y: number, w: number, h: number, z = 0): Point[] {
    return [project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)]
}
