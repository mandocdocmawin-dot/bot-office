import type { Config } from './config.js'
import type { Point, Rect, Room } from './protocol.js'

const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

const DIRECTIONS: readonly [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1]
]
const { SQRT2 } = Math

interface HeapNode {
    id: string
    f: number
}

class MinHeap {
    private data: HeapNode[] = []

    get size() {
        return this.data.length
    }

    push(item: HeapNode) {
        this.data.push(item)
        let idx = this.data.length - 1
        while (idx > 0) {
            const parent = (idx - 1) >> 1
            if (this.data[idx].f < this.data[parent].f) {
                const temp = this.data[idx]
                this.data[idx] = this.data[parent]
                this.data[parent] = temp
                idx = parent
            } else {
                break
            }
        }
    }

    pop(): HeapNode | undefined {
        if (this.data.length === 0) {
            return undefined
        }
        const top = this.data[0]
        const bottom = this.data.pop()!
        if (this.data.length > 0) {
            this.data[0] = bottom
            let idx = 0
            const { length } = this.data
            while (true) {
                const left = (idx << 1) + 1
                const right = left + 1
                let smallest = idx
                if (left < length && this.data[left].f < this.data[smallest].f) {
                    smallest = left
                }
                if (right < length && this.data[right].f < this.data[smallest].f) {
                    smallest = right
                }
                if (smallest === idx) {
                    break
                } else {
                    const temp = this.data[idx]
                    this.data[idx] = this.data[smallest]
                    this.data[smallest] = temp
                    idx = smallest
                }
            }
        }
        return top
    }
}

export class World {
    private walkableAreas: Rect[]
    private sampleOffsets: [number, number][]

    constructor(public config: Config) {
        this.walkableAreas = [...config.rooms, ...config.doors]
        const r = config.player_radius
        const diag = r * 0.707
        this.sampleOffsets = [
            [0, 0],
            [r, 0],
            [-r, 0],
            [0, r],
            [0, -r],
            [diag, diag],
            [-diag, diag],
            [diag, -diag],
            [-diag, -diag]
        ]
    }

    walkable(x: number, y: number): boolean {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return false
        }
        for (let i = 0; i < this.sampleOffsets.length; i++) {
            const [dx, dy] = this.sampleOffsets[i]
            const px = x + dx
            const py = y + dy
            let inWalkable = false
            for (let j = 0; j < this.walkableAreas.length; j++) {
                if (contains(this.walkableAreas[j], px, py)) {
                    inWalkable = true
                    break
                }
            }
            if (!inWalkable) {
                return false
            }
            for (let j = 0; j < this.config.obstacles.length; j++) {
                if (contains(this.config.obstacles[j], px, py)) {
                    return false
                }
            }
        }
        return true
    }
    roomAt(x: number, y: number, previous: Room = 'Commons'): Room {
        return this.config.rooms.find((r) => contains(r, x, y))?.name ?? previous
    }
    spawn(room: Room, slot = 0): Point {
        const r = this.config.rooms.find((r) => r.name === room)!
        const points: Point[] = []
        for (let y = r.y + 80; y < r.y + r.h - 20; y += 28) {
            for (let x = r.x + 50; x < r.x + r.w - 20; x += 28) {
                if (this.walkable(x, y)) {
                    points.push({ x, y })
                }
            }
        }
        if (points.length === 0) {
            throw new Error(`Room ${room} has no safe spawn`)
        }
        return points[(slot * 7) % points.length]
    }
    step(position: Point, dx: number, dy: number): Point {
        if (dx === 0 && dy === 0) {
            return position
        }
        let { x, y } = position
        // Substeps prevent tunnelling even after an event-loop pause.
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3))
        for (let i = 0; i < steps; i++) {
            if (this.walkable(x + dx / steps, y)) {
                x += dx / steps
            }
            if (this.walkable(x, y + dy / steps)) {
                y += dy / steps
            }
        }
        return { x, y }
    }
    clearLine(a: Point, b: Point) {
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)
        for (let i = 0; i <= steps; i++) {
            const t = steps ? i / steps : 0
            if (!this.walkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) {
                return false
            }
        }
        return true
    }
    path(start: Point, end: Point): Point[] {
        if (!this.walkable(end.x, end.y) || Math.abs(end.x) > 2000 || Math.abs(end.y) > 2000) {
            return []
        }
        if (this.clearLine(start, end)) {
            return [end]
        }
        // Bounded A* over the same collision geometry used by manual movement.
        const grid = 16
        const key = (x: number, y: number) => `${x},${y}`
        // Anchor the search lattice to the actual player. Rounding the start onto
        // a global grid can put it inside furniture, trapping clicks from narrow aisles.
        const sx = 0
        const sy = 0
        const ex = (end.x - start.x) / grid
        const ey = (end.y - start.y) / grid
        const point = (x: number, y: number) => ({ x: start.x + x * grid, y: start.y + y * grid })
        const nodes = new Map<string, { x: number; y: number; g: number; f: number; parent?: string }>()
        const first = key(sx, sy)
        const openHeap = new MinHeap()
        const closed = new Set<string>()
        const initialF = Math.hypot(ex - sx, ey - sy)
        nodes.set(first, { x: sx, y: sy, g: 0, f: initialF })
        openHeap.push({ id: first, f: initialF })

        while (openHeap.size > 0 && closed.size < 8000) {
            const top = openHeap.pop()!
            const best = top.id
            if (closed.has(best)) {
                continue
            }
            const n = nodes.get(best)!
            if (top.f > n.f) {
                continue
            }
            const p = point(n.x, n.y)
            closed.add(best)
            if (Math.hypot(p.x - end.x, p.y - end.y) <= grid * 2 && this.clearLine(p, end)) {
                const result: Point[] = [end]
                let cursor: string | undefined = best
                while (cursor && cursor !== first) {
                    const v: { x: number; y: number; parent?: string } = nodes.get(cursor)!
                    result.unshift(point(v.x, v.y))
                    cursor = v.parent
                }
                if (result[0] && !this.clearLine(start, result[0])) {
                    return []
                }
                return result
            }
            for (let i = 0; i < DIRECTIONS.length; i++) {
                const [dx, dy] = DIRECTIONS[i]
                const x = n.x + dx
                const y = n.y + dy
                const id = key(x, y)
                if (closed.has(id)) {
                    continue
                }
                const next = point(x, y)
                if (!this.walkable(next.x, next.y)) {
                    continue
                }
                if (dx !== 0 && dy !== 0) {
                    if (!this.walkable(p.x + dx * grid, p.y) || !this.walkable(p.x, p.y + dy * grid)) {
                        continue
                    }
                }
                const stepCost = dx === 0 || dy === 0 ? 1 : SQRT2
                const cost = n.g + stepCost
                const existing = nodes.get(id)
                if (!existing || cost < existing.g) {
                    const f = cost + Math.hypot(ex - x, ey - y)
                    nodes.set(id, { x, y, g: cost, f, parent: best })
                    openHeap.push({ id, f })
                }
            }
        }
        return []
    }
}
