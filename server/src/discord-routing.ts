import type { Config } from './config.js';
import type { Room } from './protocol.js';
const smallCaps = Object.fromEntries(Array.from('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ', (letter, index) => [letter, 'abcdefghijklmnopqrstuvwxyz'[index]]));
export const channelKey = (name: string) => Array.from(name.normalize('NFKD').toLowerCase(), letter => smallCaps[letter] ?? letter).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function textRoom(config: Config, channel: { id: string; name: string }, parent?: { id: string; name: string } | null): Room {
  const d = config.discord;
  // A thread's free-form title must never override its mapped parent forum.
  for (const candidate of [parent, channel]) {
    if (!candidate) continue;
    const match = d?.channels.find(c => c.id && c.id === candidate.id) ?? d?.channels.find(c => c.names.some(name => channelKey(name) === channelKey(candidate.name)));
    if (match) return match.room;
  }
  return d?.default_room ?? 'Commons';
}
export function voiceRoom(config: Config, channel: { id: string; name: string }, categoryName?: string | null): Room {
  const d = config.discord;
  // An explicit main voice ID takes precedence; names are the setup-free fallback.
  if ((d?.main_general_voice_channel_id && channel.id === d.main_general_voice_channel_id) || (!d?.main_general_voice_channel_id && channelKey(channel.name) === 'general')) return 'Commons';
  if (d && categoryName && channelKey(categoryName) === channelKey(d.voice_category)) return 'Meeting Room';
  return textRoom(config, channel);
}
