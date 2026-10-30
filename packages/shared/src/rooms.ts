import type { Rect } from './protocol.js'

export const colorCSS = (color: number) => `#${color.toString(16).padStart(6, '0')}`

export const roomDisplayName = (name: string) => name === 'Commons' ? 'Tambayan' : name

// Local to Commons. Keeping pods off the central cross preserves all four doors.
export const TAMBAYAN_PODS = [{ x: 105, y: 335 }, { x: 416, y: 112 }, { x: 402, y: 344 }] as const
export const TAMBAYAN_SEATS_PER_POD = 4
export const TAMBAYAN_CHAIR_RADIUS = 44
export const TAMBAYAN_PLANTS = [[21, 23], [21, 190], [118, 22], [298, 22], [499, 23],
    [499, 186], [22, 418], [196, 418], [495, 417], [496, 336]] as const

// Sprite placement and authoritative ground footprints must share one source.
export const TAMBAYAN_PROPS = [
    { id: 'coffee-v2', x: 43, y: 119, width: 112, inset: .17, footprint: { x: 5, y: 61, w: 76, h: 116 } },
    { id: 'board-v2', x: 180, y: 28, width: 104, inset: .08, footprint: { x: 119, y: 12, w: 122, h: 32 } },
    { id: 'media-v2', x: 387, y: 25, width: 144, inset: .09, footprint: { x: 307, y: 7, w: 160, h: 39 } },
    { id: 'kiosk-v2', x: 477, y: 294, width: 35, inset: .2, footprint: { x: 464, y: 281, w: 26, h: 26 } }
] as const

export function tambayanSeats(room: Pick<Rect, 'x' | 'y'>) {
    const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]
    return TAMBAYAN_PODS.flatMap((pod, podIndex) => directions.map((direction, index) => ({
        id: `${podIndex}:${index}`, index,
        x: room.x + pod.x + direction.x * TAMBAYAN_CHAIR_RADIUS,
        y: room.y + pod.y + direction.y * TAMBAYAN_CHAIR_RADIUS,
        direction
    })))
}

export function tambayanObstacles(room: Pick<Rect, 'x' | 'y'>): Rect[] {
    return [
        ...TAMBAYAN_PROPS.map(prop => ({ ...prop.footprint, x: room.x + prop.footprint.x, y: room.y + prop.footprint.y })),
        ...TAMBAYAN_PLANTS.map(([x, y]) => ({ x: room.x + x - 8, y: room.y + y - 8, w: 16, h: 16 })),
        ...TAMBAYAN_PODS.map(pod => ({ x: room.x + pod.x - 16, y: room.y + pod.y - 16, w: 32, h: 32 })),
        ...tambayanSeats(room).map(seat => ({ x: seat.x - 16, y: seat.y - 16, w: 32, h: 32 }))
    ]
}
