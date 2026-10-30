import type { Member, Point, RoomLayout } from './protocol.js'
import { tambayanSeats } from '@office/shared/rooms'
import type { World } from './world.js'

export interface SocialPlayer extends Member {
    path: Point[]; dx: number; dy: number; inputUntil: number; manualDriving: boolean
}
type Intent = { kind: 'seat'; seatId: string; entry: Point; until: number } |
    { kind: 'approach'; targetId: string; until: number; nextPlan: number; target: Point }

/** Owns reservations; clients can request a seat but never choose their position. */
export class SocialMovement {
    readonly seats: ReturnType<typeof tambayanSeats>
    private owners = new Map<string, string>()
    private entries = new Map<string, Point>()
    private intents = new Map<string, Intent>()

    constructor(private world: World, room: RoomLayout,
        private members: Map<string, SocialPlayer>, private now: () => number) {
        this.seats = tambayanSeats(room)
    }

    cancel(player: SocialPlayer) {
        const entry = this.entries.get(player.id)
        if (player.seatId && entry) Object.assign(player, entry)
        delete player.seatId
        this.entries.delete(player.id)
        this.intents.delete(player.id)
        for (const [seatId, owner] of this.owners) if (owner === player.id) this.owners.delete(seatId)
    }

    private drive(player: SocialPlayer, path: Point[]) {
        player.path = path
        player.dx = player.dy = 0
        player.inputUntil = 0
        player.manualDriving = false
        player.sleeping = false
    }

    private seatEntries(seat: (typeof this.seats)[number]): Point[] {
        const outward = Math.atan2(seat.direction.y, seat.direction.x)
        return [0, -.55, .55, -1.1, 1.1, -1.57, 1.57].map(offset => ({
            x: seat.x + Math.cos(outward + offset) * 33,
            y: seat.y + Math.sin(outward + offset) * 33
        })).filter(point => this.world.walkable(point.x, point.y))
    }

    sit(player: SocialPlayer, requestedId?: string): boolean {
        if (player.seatId && (!requestedId || requestedId === player.seatId)) return true
        const pending = this.intents.get(player.id)
        if (pending?.kind === 'seat' && (!requestedId || requestedId === pending.seatId)) return true
        const start = this.entries.get(player.id) ?? player
        const seats = this.seats.filter(seat => (!requestedId || seat.id === requestedId) &&
            (!this.owners.has(seat.id) || this.owners.get(seat.id) === player.id))
            .sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y))
        for (const seat of seats) for (const entry of this.seatEntries(seat)) {
            const path = this.world.path(start, entry)
            if (!path.length) continue
            this.cancel(player)
            this.owners.set(seat.id, player.id)
            this.intents.set(player.id, { kind: 'seat', seatId: seat.id, entry, until: this.now() + 30_000 })
            this.drive(player, path)
            return true
        }
        return false
    }

    mentioned(player: SocialPlayer, text = '', explicitIds: readonly string[] = []): string | undefined {
        const ids = [...explicitIds, ...[...text.matchAll(/<@!?(\d+)>/g)].map(match => match[1])]
        const eligible = (target: SocialPlayer | undefined) => target && target.id !== player.id &&
            !target.sleeping && target.presence !== 'offline'
        for (const id of ids) if (eligible(this.members.get(id))) return id
        // Local room chat also accepts @Display Name. Duplicate names are ambiguous.
        const candidates = [...this.members.values()].filter(target => eligible(target)).filter(target => {
            const escaped = target.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            return new RegExp(`@${escaped}(?=$|[\\s,.:;!?])`, 'iu').test(text)
        })
        candidates.sort((a, b) => b.username.length - a.username.length)
        const first = candidates[0]
        return first && candidates.filter(target => target.username.toLocaleLowerCase() === first.username.toLocaleLowerCase()).length === 1
            ? first.id : undefined
    }

    private approachPath(player: SocialPlayer, target: SocialPlayer): Point[] {
        const options: Point[] = []
        const entry = this.entries.get(target.id)
        if (entry) options.push(entry)
        for (const radius of [42, 58, 74]) for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8
            options.push({ x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius })
        }
        options.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
        for (const point of options) {
            if (this.world.roomAt(point.x, point.y) !== target.room) continue
            const path = this.world.path(player, point)
            if (path.length) return path
        }
        return []
    }

    approach(player: SocialPlayer, targetId: string): boolean {
        const target = this.members.get(targetId)
        if (!target || target.id === player.id || target.sleeping || target.presence === 'offline') return false
        this.cancel(player)
        const path = this.approachPath(player, target)
        if (!path.length) return false
        this.drive(player, path)
        this.intents.set(player.id, { kind: 'approach', targetId, until: this.now() + 30_000,
            nextPlan: this.now() + 800, target: { x: target.x, y: target.y } })
        return true
    }

    tick(player: SocialPlayer) {
        const intent = this.intents.get(player.id)
        if (!intent) return
        if (intent.kind === 'seat') {
            if (this.now() > intent.until) { this.cancel(player); this.drive(player, []); return }
            if (player.path.length || Math.hypot(player.x - intent.entry.x, player.y - intent.entry.y) > 3) return
            const seat = this.seats.find(seat => seat.id === intent.seatId)!
            Object.assign(player, { x: seat.x, y: seat.y, seatId: seat.id, room: 'Commons', moving: false })
            this.entries.set(player.id, intent.entry)
            this.intents.delete(player.id)
            return
        }
        const target = this.members.get(intent.targetId)
        if (!target || target.sleeping || target.presence === 'offline' || this.now() >= intent.until) {
            this.intents.delete(player.id)
            this.drive(player, [])
            return
        }
        if (!player.path.length && Math.hypot(player.x - target.x, player.y - target.y) < 80) {
            this.intents.delete(player.id)
            return
        }
        if (this.now() >= intent.nextPlan) {
            intent.nextPlan = this.now() + 800
            if (Math.hypot(target.x - intent.target.x, target.y - intent.target.y) > 16) {
                this.drive(player, this.approachPath(player, target))
                intent.target = { x: target.x, y: target.y }
            }
        }
    }
}
