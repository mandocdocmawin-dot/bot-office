import type { Config } from './config.js';
import type { ClientPacket, Identity, Member, Point, Room, Snapshot } from './protocol.js';
import { World } from './world.js';
interface Player extends Member { lastInput: number; inputUntil: number; dx: number; dy: number; path: Point[]; lastChat: number; lastPath: number }
export const EMOTES = ['👋', '❤️', '😂', '🎉', '☕'];
export class Office {
  members = new Map<string, Player>();
  world: World;
  constructor(public config: Config, public mode: 'mock' | 'multiplayer', private bubble: (id: string, room: Room, text: string) => void, private now = () => Date.now()) { this.world = new World(config); }
  snapshot(): Snapshot {
    return { members: [...this.members.values()].map(({ id, username, avatar, x, y, room, sleeping, moving }) => ({ id, username, avatar, x, y, room, sleeping, moving })), config: { serverName: this.config.server_name, bubbleEnabled: this.config.bubble_enabled, bubbleDurationMs: this.config.bubble_duration_ms }, mode: this.mode, ready: true };
  }
  join(identity: Identity, restore?: Pick<Member, 'x' | 'y' | 'room' | 'sleeping'>) {
    const old = this.members.get(identity.id);
    const position = old ?? restore ?? { ...this.world.spawn('Front Office', this.members.size), room: 'Front Office' as Room, sleeping: false };
    this.members.set(identity.id, { ...identity, x: position.x, y: position.y, room: position.room, sleeping: position.sleeping, moving: false, lastInput: this.now(), inputUntil: 0, dx: 0, dy: 0, path: [], lastChat: -Infinity, lastPath: -Infinity });
  }
  leave(id: string) { const player = this.members.get(id); this.members.delete(id); return player; }
  input(id: string, packet: ClientPacket) {
    const p = this.members.get(id); if (!p) return;
    p.lastInput = this.now(); p.sleeping = false;
    if (packet.type === 'input') {
      const magnitude = Math.max(1, Math.hypot(packet.dx, packet.dy));
      p.dx = packet.dx / magnitude; p.dy = packet.dy / magnitude; p.inputUntil = this.now() + 220; p.path = [];
    } else if (packet.type === 'move_to' && this.now() - p.lastPath > 350) {
      p.lastPath = this.now(); p.path = this.world.path(p, packet); p.dx = 0; p.dy = 0; p.inputUntil = 0;
    } else if ((packet.type === 'chat' || packet.type === 'emote') && this.now() - p.lastChat >= 900) {
      p.lastChat = this.now();
      const text = packet.type === 'emote' ? EMOTES[packet.index] : Array.from(packet.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, this.config.bubble_max_chars).join('');
      if (text && this.config.bubble_enabled) this.bubble(id, p.room, text);
    }
  }
  tick(seconds: number) {
    const dt = Math.max(0, Math.min(seconds, .1));
    for (const p of this.members.values()) {
      if (this.now() - p.lastInput >= this.config.idle_timeout_ms) {
        if (!p.sleeping) { Object.assign(p, this.world.spawn('Nap Room', [...this.members.keys()].indexOf(p.id))); p.room = 'Nap Room'; p.sleeping = true; p.path = []; p.dx = p.dy = 0; }
        p.moving = false; continue;
      }
      let dx = this.now() <= p.inputUntil ? p.dx : 0, dy = this.now() <= p.inputUntil ? p.dy : 0;
      if (p.path.length) {
        let target = p.path[0], distance = Math.hypot(target.x - p.x, target.y - p.y);
        if (distance < 2) { p.path.shift(); target = p.path[0]; }
        if (target) { distance = Math.hypot(target.x - p.x, target.y - p.y); const scale = Math.min(1, distance / (this.config.player_speed * dt || 1)); dx = (target.x - p.x) / (distance || 1) * scale; dy = (target.y - p.y) / (distance || 1) * scale; } else { dx = dy = 0; }
      }
      const next = this.world.step(p, dx * this.config.player_speed * dt, dy * this.config.player_speed * dt);
      p.moving = Math.hypot(next.x - p.x, next.y - p.y) > .01; p.x = next.x; p.y = next.y;
      p.room = this.world.roomAt(p.x, p.y, p.room);
    }
  }
}
