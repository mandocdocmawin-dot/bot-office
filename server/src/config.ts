import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOMS, type Rect, type Room, type RoomLayout } from './protocol.js';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export interface Config {
  server_name: string; idle_timeout_ms: number; bubble_enabled: boolean; bubble_duration_ms: number;
  bubble_max_chars: number; player_speed: number; player_radius: number; tick_rate: number;
  rooms: RoomLayout[]; doors: Rect[]; obstacles: Rect[];
  discord?: { enabled: boolean; hybrid_controls?: boolean; speaking_indicator?: boolean; speaking_channel_id?: string; message_previews: boolean; message_stay_ms: number; welcome_stay_ms: number; offline_behavior: 'hide' | 'grey'; default_room: Room; main_general_voice_channel_id: string; voice_category: string; channels: { id: string; names: string[]; room: Room }[] };
}
const rect = (r: Rect) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('config.json must be an object');
  const c = value as Config;
  if (!c.server_name || typeof c.bubble_enabled !== 'boolean') throw new Error('Invalid display settings');
  if (!Array.isArray(c.rooms) || c.rooms.length !== ROOMS.length || new Set(c.rooms.map(r => r.name)).size !== ROOMS.length || !c.rooms.every(r => rect(r) && ROOMS.includes(r.name) && Number.isInteger(r.color) && r.color >= 0 && r.color <= 0xffffff && typeof r.subtitle === 'string' && typeof r.icon === 'string')) throw new Error('Invalid room definitions');
  if (!Array.isArray(c.doors) || !Array.isArray(c.obstacles) || ![...c.doors, ...c.obstacles].every(rect)) throw new Error('Invalid collision areas');
  for (const key of ['idle_timeout_ms', 'bubble_duration_ms', 'bubble_max_chars', 'player_speed', 'player_radius', 'tick_rate'] as const) if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`Invalid ${key}`);
  if (c.tick_rate < 10 || c.tick_rate > 20 || !Number.isInteger(c.tick_rate) || c.bubble_max_chars > 80) throw new Error('Use 10–20 ticks/sec and at most 80 characters');
  const d = c.discord;
  if (d && ((d.hybrid_controls !== undefined && typeof d.hybrid_controls !== 'boolean') || (d.speaking_indicator !== undefined && typeof d.speaking_indicator !== 'boolean') || (d.speaking_channel_id !== undefined && typeof d.speaking_channel_id !== 'string'))) throw new Error('Invalid hybrid/voice settings');
  if (d && (typeof d.enabled !== 'boolean' || typeof d.message_previews !== 'boolean' || !['hide', 'grey'].includes(d.offline_behavior) || !ROOMS.includes(d.default_room) || !Number.isSafeInteger(d.message_stay_ms) || d.message_stay_ms <= 0 || !Number.isSafeInteger(d.welcome_stay_ms) || d.welcome_stay_ms <= 0 || typeof d.voice_category !== 'string' || typeof d.main_general_voice_channel_id !== 'string' || !Array.isArray(d.channels) || !d.channels.every(c => typeof c.id === 'string' && Array.isArray(c.names) && c.names.every(n => typeof n === 'string') && ROOMS.includes(c.room)))) throw new Error('Invalid Discord activity settings');
  return c;
}
export function loadConfig(): Config { return validateConfig(JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8').replace(/^\uFEFF/, ''))); }
