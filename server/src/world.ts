import type { Config } from './config.js';
import type { Point, Rect, Room } from './protocol.js';
const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export class World {
  constructor(public config: Config) {}
  walkable(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = this.config.player_radius;
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * .707, r * .707], [-r * .707, r * .707], [r * .707, -r * .707], [-r * .707, -r * .707]]) {
      const px = x + dx, py = y + dy;
      if (![...this.config.rooms, ...this.config.doors].some(area => contains(area, px, py))) return false;
      if (this.config.obstacles.some(area => contains(area, px, py))) return false;
    }
    return true;
  }
  roomAt(x: number, y: number, previous: Room = 'Commons'): Room { return this.config.rooms.find(r => contains(r, x, y))?.name ?? previous; }
  spawn(room: Room, slot = 0): Point {
    const r = this.config.rooms.find(r => r.name === room)!;
    const points: Point[] = [];
    for (let y = r.y + 80; y < r.y + r.h - 20; y += 28) for (let x = r.x + 50; x < r.x + r.w - 20; x += 28) if (this.walkable(x, y)) points.push({ x, y });
    if (!points.length) throw new Error(`Room ${room} has no safe spawn`);
    return points[(slot * 7) % points.length];
  }
  step(position: Point, dx: number, dy: number): Point {
    let { x, y } = position;
    // Substeps prevent tunnelling even after an event-loop pause.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    for (let i = 0; i < steps; i++) {
      if (this.walkable(x + dx / steps, y)) x += dx / steps;
      if (this.walkable(x, y + dy / steps)) y += dy / steps;
    }
    return { x, y };
  }
  clearLine(a: Point, b: Point) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let i = 0; i <= steps; i++) { const t = steps ? i / steps : 0; if (!this.walkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
    return true;
  }
  path(start: Point, end: Point): Point[] {
    if (!this.walkable(end.x, end.y) || Math.abs(end.x) > 2000 || Math.abs(end.y) > 2000) return [];
    if (this.clearLine(start, end)) return [end];
    // Bounded A* over the same collision geometry used by manual movement.
    const grid = 16, key = (x: number, y: number) => `${x},${y}`;
    // Anchor the search lattice to the actual player. Rounding the start onto
    // a global grid can put it inside furniture, trapping clicks from narrow aisles.
    const sx = 0, sy = 0, ex = (end.x - start.x) / grid, ey = (end.y - start.y) / grid;
    const point = (x: number, y: number) => ({ x: start.x + x * grid, y: start.y + y * grid });
    const nodes = new Map<string, { x: number; y: number; g: number; f: number; parent?: string }>();
    const first = key(sx, sy), open = new Set([first]), closed = new Set<string>();
    nodes.set(first, { x: sx, y: sy, g: 0, f: Math.hypot(ex - sx, ey - sy) });
    while (open.size && closed.size < 8000) {
      let best = ''; let score = Infinity;
      for (const id of open) if (nodes.get(id)!.f < score) { best = id; score = nodes.get(id)!.f; }
      const n = nodes.get(best)!; const p = point(n.x, n.y);
      open.delete(best); closed.add(best);
      if (Math.hypot(p.x - end.x, p.y - end.y) <= grid * 2 && this.clearLine(p, end)) {
        const result: Point[] = [end]; let cursor: string | undefined = best;
        while (cursor && cursor !== first) { const v: { x: number; y: number; parent?: string } = nodes.get(cursor)!; result.unshift(point(v.x, v.y)); cursor = v.parent; }
        if (result[0] && !this.clearLine(start, result[0])) return [];
        return result;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = n.x + dx, y = n.y + dy, id = key(x, y);
        const next = point(x, y);
        if (closed.has(id) || !this.walkable(next.x, next.y) || !this.clearLine(p, next)) continue;
        const cost = n.g + Math.hypot(dx, dy);
        if (!nodes.has(id) || cost < nodes.get(id)!.g) { nodes.set(id, { x, y, g: cost, f: cost + Math.hypot(ex - x, ey - y), parent: best }); open.add(id); }
      }
    }
    return [];
  }
}
