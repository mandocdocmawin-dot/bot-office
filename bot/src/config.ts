import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOMS, type Room } from './protocol.js';
// Source and dist both live one level below /bot.
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export interface Config {
  server_name: string; channels: { id: string; room: Room; _comment?: string }[];
  main_general_voice_channel_id: string; dynamic_voice_category_name: string;
  default_room_for_unmapped_channel: Room; idle_timeout_ms: number; message_stay_ms: number;
  new_member_stay_ms: number; bubble_enabled: boolean; bubble_duration_ms: number;
  bubble_max_chars: number; offline_behavior: 'hide' | 'grey';
}
export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('config.json must be an object');
  const c = value as Config;
  if (!Array.isArray(c.channels) || !c.channels.every(x => typeof x.id === 'string' && ROOMS.includes(x.room))) throw new Error('Invalid channel mapping');
  if (new Set(c.channels.map(x => x.id)).size !== c.channels.length) throw new Error('Duplicate channel IDs');
  if (!ROOMS.includes(c.default_room_for_unmapped_channel)) throw new Error('Invalid default room');
  for (const key of ['idle_timeout_ms', 'message_stay_ms', 'new_member_stay_ms', 'bubble_duration_ms', 'bubble_max_chars'] as const) {
    if (!Number.isSafeInteger(c[key]) || c[key] <= 0) throw new Error(`Invalid ${key}`);
  }
  if (c.bubble_max_chars > 40) throw new Error('bubble_max_chars must be <= 40');
  if (typeof c.bubble_enabled !== 'boolean' || !['hide', 'grey'].includes(c.offline_behavior)) throw new Error('Invalid privacy configuration');
  for (const key of ['server_name', 'main_general_voice_channel_id', 'dynamic_voice_category_name'] as const) {
    if (typeof c[key] !== 'string' || !c[key].trim()) throw new Error(`Invalid ${key}`);
  }
  return c;
}
export function loadConfig(): Config { return validateConfig(JSON.parse(readFileSync(`${ROOT}/config.json`, 'utf8'))); }
