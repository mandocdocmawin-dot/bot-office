import type { Config } from './config.js';
import type { ClientPacket, DiscordStatus, Identity, Member, Point, Room, Snapshot, VoiceMonitorStatus } from './protocol.js';
import { World } from './world.js';
interface Player extends Member { lastInput: number; inputUntil: number; dx: number; dy: number; path: Point[]; lastChat: number; lastPath: number; manualDriving: boolean; speakingUntil: number }
export const EMOTES = ['👋', '❤️', '😂', '🎉', '☕'];
export class Office {
  members = new Map<string, Player>();
  world: World;
  discord: DiscordStatus = { state: 'disabled', detail: 'Discord activity is disabled.' };
  voiceMonitor: VoiceMonitorStatus = { state: 'disabled', detail: 'Speaking indicator is disabled.' };
  private activity = new Map<string, { lastActivity: number; returnAt: number | null; voiceRoom: Room | null }>();
  constructor(public config: Config, public mode: 'mock' | 'multiplayer', private bubble: (id: string, room: Room, text: string) => void, private now = () => Date.now()) { this.world = new World(config); }
  snapshot(): Snapshot {
    return { members: [...this.members.values()].filter(p => !(p.source === 'discord' && p.presence === 'offline' && this.config.discord?.offline_behavior === 'hide')).map(({ id, username, avatar, x, y, room, sleeping, moving, source, presence, inVoice, voiceChannelId, voiceChannelName, muted, speaking }) => ({ id, username, avatar, x, y, room, sleeping, moving, ...(source ? { source, presence } : {}), ...(inVoice !== undefined ? { inVoice, voiceChannelId, voiceChannelName, muted, speaking: !!speaking } : {}) })), config: { serverName: this.config.server_name, bubbleEnabled: this.config.bubble_enabled, bubbleDurationMs: this.config.bubble_duration_ms, hybridControls: this.config.discord?.hybrid_controls !== false }, mode: this.mode, ready: true, discord: this.discord, voiceMonitor: this.voiceMonitor };
  }
  join(identity: Identity, restore?: Pick<Member, 'x' | 'y' | 'room' | 'sleeping'>) {
    const old = this.members.get(identity.id);
    if (old?.source === 'discord') { Object.assign(old, identity); return; }
    const position = old ?? restore ?? { ...this.world.spawn('Front Office', this.members.size), room: 'Front Office' as Room, sleeping: false };
    this.members.set(identity.id, { ...identity, x: position.x, y: position.y, room: position.room, sleeping: position.sleeping, moving: false, lastInput: this.now(), inputUntil: 0, dx: 0, dy: 0, path: [], lastChat: -Infinity, lastPath: -Infinity, manualDriving: false, speakingUntil: 0 });
  }
  leave(id: string) { const player = this.members.get(id); if (player?.source !== 'discord') this.members.delete(id); return player; }
  forgetDiscordMember(id: string) { this.activity.delete(id); this.members.delete(id); }
  upsertDiscord(identity: Identity, presence: NonNullable<Member['presence']>, welcome = false) {
    if (!this.members.has(identity.id)) this.join(identity);
    const p = this.members.get(identity.id)!; Object.assign(p, identity, { source: 'discord', presence });
    if (!this.activity.has(identity.id)) this.activity.set(identity.id, { lastActivity: this.now(), returnAt: null, voiceRoom: null });
    if (welcome) { const a = this.activity.get(identity.id)!; a.lastActivity = this.now(); a.returnAt = this.now() + (this.config.discord?.welcome_stay_ms ?? 10000); this.route(p, 'Front Office'); }
  }
  private route(p: Player, room: Room) {
    const target = this.world.spawn(room, [...this.members.keys()].indexOf(p.id));
    p.path = this.world.path(p, target); p.dx = p.dy = 0; p.inputUntil = 0; p.sleeping = false; p.manualDriving = false;
    // The shipped layout has doors between every room. This fallback also
    // handles a future edited layout with no traversable route.
    if (!p.path.length) { Object.assign(p, target); p.room = room; }
  }
  discordMessage(id: string, room: Room, content?: string) {
    const p = this.members.get(id), a = this.activity.get(id); if (!p || !a) return;
    a.lastActivity = this.now(); a.returnAt = a.voiceRoom ? null : this.now() + (this.config.discord?.message_stay_ms ?? 120000);
    this.route(p, a.voiceRoom ?? room);
    // Snippets exist only in this call and the live WebSocket packet.
    if (this.config.bubble_enabled && this.config.discord?.message_previews && content && (p.presence !== 'offline' || this.config.discord.offline_behavior === 'grey')) {
      const text = Array.from(content.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, Math.min(40, this.config.bubble_max_chars)).join('');
      if (text) this.bubble(id, p.room, text);
    }
  }
  discordVoice(id: string, room: Room | null, voice?: { channelId: string; channelName: string; muted: boolean }) {
    const p = this.members.get(id), a = this.activity.get(id); if (!p || !a) return;
    a.lastActivity = this.now(); a.voiceRoom = room; a.returnAt = null;
    this.discordVoiceState(id, voice ?? (room ? { channelId: '', channelName: room, muted: false } : null));
    this.route(p, room ?? 'Commons');
  }
  discordVoiceState(id: string, voice: { channelId: string; channelName: string; muted: boolean } | null) {
    const p = this.members.get(id); if (!p) return;
    const changed = p.voiceChannelId !== voice?.channelId;
    p.inVoice = !!voice; p.voiceChannelId = voice?.channelId; p.voiceChannelName = voice?.channelName; p.muted = voice?.muted ?? false;
    if (!voice || voice.muted || changed) { p.speaking = false; p.speakingUntil = 0; }
  }
  speaking(id: string, active: boolean) {
    const p = this.members.get(id); if (!p || !p.inVoice || p.muted) return;
    p.speakingUntil = active ? this.now() + 700 : Math.min(p.speakingUntil, this.now() + 150);
    p.speaking = p.speakingUntil > this.now();
  }
  clearSpeaking() { for (const p of this.members.values()) { p.speaking = false; p.speakingUntil = 0; } }
  discordPresence(id: string, presence: NonNullable<Member['presence']>) {
    const p = this.members.get(id); if (!p) return;
    const changed = p.presence !== presence; p.presence = presence;
    const a = this.activity.get(id);
    if (a && changed && presence !== 'offline') { a.lastActivity = this.now(); if (p.sleeping) this.route(p, a.voiceRoom ?? 'Commons'); }
  }
  input(id: string, packet: ClientPacket) {
    const p = this.members.get(id); if (!p) return;
    if (p.source === 'discord' && this.config.discord?.hybrid_controls === false) return;
    const activity = this.activity.get(id);
    const movement = packet.type === 'move_to' || (packet.type === 'input' && (packet.dx !== 0 || packet.dy !== 0));
    if (activity && (packet.type !== 'input' || movement || p.manualDriving)) activity.lastActivity = this.now();
    p.lastInput = this.now(); p.sleeping = false;
    if (packet.type === 'input') {
      const magnitude = Math.max(1, Math.hypot(packet.dx, packet.dy));
      p.dx = packet.dx / magnitude; p.dy = packet.dy / magnitude; p.inputUntil = this.now() + 220;
      // A stale key-up/blur packet must not erase a newly assigned Discord path.
      if (movement || p.manualDriving) { p.path = []; if (activity) activity.returnAt = null; }
      p.manualDriving = movement;
    } else if (packet.type === 'move_to' && this.now() - p.lastPath > 350) {
      p.lastPath = this.now(); const path = this.world.path(p, packet);
      if (path.length) { p.path = path; p.dx = 0; p.dy = 0; p.inputUntil = 0; p.manualDriving = true; if (activity) activity.returnAt = null; }
    } else if ((packet.type === 'chat' || packet.type === 'emote') && this.now() - p.lastChat >= 900) {
      p.lastChat = this.now();
      const text = packet.type === 'emote' ? EMOTES[packet.index] : Array.from(packet.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, this.config.bubble_max_chars).join('');
      if (text && this.config.bubble_enabled) this.bubble(id, p.room, text);
    }
  }
  tick(seconds: number) {
    const dt = Math.max(0, Math.min(seconds, .1));
    for (const p of this.members.values()) {
      p.speaking = !!p.inVoice && !p.muted && this.now() < p.speakingUntil;
      const activity = this.activity.get(p.id);
      if (activity?.returnAt !== null && activity?.returnAt !== undefined && this.now() >= activity.returnAt) { activity.returnAt = null; this.route(p, activity.voiceRoom ?? 'Commons'); }
      const lastInput = activity?.lastActivity ?? p.lastInput;
      if (!activity?.voiceRoom && this.now() - lastInput >= this.config.idle_timeout_ms) {
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
