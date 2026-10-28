import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOMS, type Rect, type RoomLayout } from './protocol.js';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export interface Config {
  server_name: string; idle_timeout_ms: number; bubble_enabled: boolean; bubble_duration_ms: number;
  bubble_max_chars: number; player_speed: number; player_radius: number; tick_rate: number;
  rooms: RoomLayout[]; doors: Rect[]; obstacles: Rect[];
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
  return c;
}
export function loadConfig(): Config { return validateConfig(JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8').replace(/^\uFEFF/, ''))); }
