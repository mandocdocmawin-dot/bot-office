"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeatingPlanner = void 0;
exports.createSeatSlots = createSeatSlots;
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function createSeatSlots(room, obstacles = []) {
    // Each corner holds a six-chair pod. The center crossing stays clear.
    // Reserve static props plus their approach space through obstacles.
    if (room.w < 420 || room.h < 360)
        return [];
    const slots = [];
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
            for (let pod = 0; pod < 4; pod++) {
                const x = room.x + (pod % 2 ? room.w - 70 - col * 42 : 40 + col * 42);
                const y = room.y + (pod < 2 ? 40 + row * 44 : room.h - 68 - row * 44);
                const clearance = { x: x - 8, y: y - 8, w: 46, h: 44 };
                if (!obstacles.some(obstacle => intersects(clearance, obstacle))) {
                    slots.push({ id: `pod-${pod}-seat-${row * 3 + col}`, x, y });
                }
            }
        }
    }
    return slots;
}
class SeatingPlanner {
    slots;
    shrinkDelayMs;
    active = new Set();
    lowSince = null;
    constructor(slots, shrinkDelayMs = 60_000) {
        this.slots = slots;
        this.shrinkDelayMs = shrinkDelayMs;
    }
    update(memberCount, occupiedSeatIds, nowMs) {
        const count = Number.isFinite(memberCount) ? Math.max(0, Math.floor(memberCount)) : 0;
        // Six seats minimum, add in groups of six with two spare places.
        const target = Math.min(this.slots.length, Math.max(6, Math.ceil((count + 2) / 6) * 6));
        const desired = new Set(this.slots.slice(0, target).map(seat => seat.id));
        for (const seat of this.slots)
            if (occupiedSeatIds.has(seat.id))
                desired.add(seat.id);
        for (const id of desired)
            this.active.add(id);
        const hasSpare = [...this.active].some(id => !desired.has(id));
        if (!hasSpare)
            this.lowSince = null;
        else {
            this.lowSince ??= nowMs;
            if (nowMs - this.lowSince >= this.shrinkDelayMs) {
                this.active = desired;
                this.lowSince = null;
            }
        }
        const seats = this.slots.filter(seat => this.active.has(seat.id));
        return { seats, capacity: seats.length, overflow: Math.max(0, count - seats.length) };
    }
}
exports.SeatingPlanner = SeatingPlanner;
