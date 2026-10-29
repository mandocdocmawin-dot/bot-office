import type { Point } from './protocol.js'

export const WORLD_WIDTH = 2200
export const WORLD_HEIGHT = 1660
export const PROJECTION_X = 0.86
export const PROJECTION_Y = 0.6

export const project = (x: number, y: number, z = 0): Point => ({
    x: 900 + (x - y) * PROJECTION_X,
    y: 60 + (x + y) * PROJECTION_Y - z
})

export const unproject = (sx: number, sy: number): Point => ({
    x: ((sx - 900) / PROJECTION_X + (sy - 60) / PROJECTION_Y) / 2,
    y: ((sy - 60) / PROJECTION_Y - (sx - 900) / PROJECTION_X) / 2
})

export function corners(x: number, y: number, w: number, h: number, z = 0): Point[] {
    return [project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)]
}
