import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { Office } from './office.js';
import { channelKey, textRoom, voiceRoom } from './discord-routing.js';
function fixture() {
  let now = 1000; const bubbles: string[] = [], config = loadConfig();
  const office = new Office(config, 'multiplayer', (_id, _room, text) => bubbles.push(text), () => now);
  office.upsertDiscord({ id: 'discord-1', username: 'Member', avatar: null }, 'online');
  const advance = (ms: number) => { now += ms; office.tick(ms / 1000); };
  const arrive = () => { for (let i = 0; i < 1800 && office.members.get('discord-1')!.path.length; i++) advance(50); };
  return { office, config, advance, arrive, bubbles };
}
test('decorated server channel names, explicit IDs, forum parents and fallback resolve', () => {
  const c = loadConfig(); assert.equal(channelKey('💬┃GENERAL'), 'general');
  assert.equal(textRoom(c, { id: 'text', name: '💬┃GENERAL' }), 'Commons');
  assert.equal(textRoom(c, { id: 'study', name: '📚┃STUDY' }), 'Study Hall');
  assert.equal(textRoom(c, { id: 'thread', name: 'New project' }, { id: 'forum', name: '🖼┃SHARE-PROJECTS' }), 'Showcase');
  assert.equal(textRoom(c, { id: 'thread', name: 'general' }, { id: 'forum', name: '🖼┃SHARE-PROJECTS' }), 'Showcase');
  assert.equal(textRoom(c, { id: 'unknown', name: 'random' }), 'Commons');
  c.discord!.channels.unshift({ id: 'configured', names: [], room: 'Studio' });
  assert.equal(textRoom(c, { id: 'configured', name: 'Renamed channel' }), 'Studio');
  c.discord!.main_general_voice_channel_id = 'main';
  assert.equal(voiceRoom(c, { id: 'main', name: '💬┃GENERAL' }, 'CALL FOR VOICE'), 'Commons');
  assert.equal(voiceRoom(c, { id: 'dynamic-123', name: 'A new call' }, 'CALL FOR VOICE'), 'Meeting Room');
});
test('Discord message routes a member through doors, returns to Commons after two minutes', () => {
  const { office, advance, arrive } = fixture();
  office.discordMessage('discord-1', 'Study Hall', 'Hello'); arrive(); assert.equal(office.members.get('discord-1')!.room, 'Study Hall');
  advance(120000); arrive(); assert.equal(office.members.get('discord-1')!.room, 'Commons');
});
test('voice overrides messages and prevents naps; voice leave returns to Commons', () => {
  const { office, advance, arrive } = fixture();
  office.discordVoice('discord-1', 'Meeting Room'); office.discordMessage('discord-1', 'Studio'); arrive();
  assert.equal(office.members.get('discord-1')!.room, 'Meeting Room');
  advance(office.config.idle_timeout_ms * 2); assert.equal(office.members.get('discord-1')!.sleeping, false);
  office.discordVoice('discord-1', null); arrive(); assert.equal(office.members.get('discord-1')!.room, 'Commons');
});
test('tracked members survive viewer disconnect and ignore browser movement/wake', () => {
  const { office, advance } = fixture(); const p = office.members.get('discord-1')!;
  office.leave(p.id); assert.ok(office.members.has(p.id));
  advance(office.config.idle_timeout_ms); assert.equal(p.sleeping, true);
  office.input(p.id, { type: 'wake' }); assert.equal(p.sleeping, true);
  office.discordMessage(p.id, 'Tech Lab'); assert.equal(p.sleeping, false);
  const path = p.path; office.input(p.id, { type: 'input', dx: 1, dy: 0 }); assert.equal(p.path, path);
  office.join({ id: p.id, username: 'Updated', avatar: null }); assert.equal(office.members.get(p.id), p);
  office.forgetDiscordMember(p.id); assert.equal(office.members.has(p.id), false);
});
test('Discord previews are transient and privacy switch disables content transmission', () => {
  const { office, config, bubbles } = fixture(); office.discordMessage('discord-1', 'Commons', '🙂'.repeat(60));
  assert.equal(Array.from(bubbles[0]).length, 40); assert.ok(!JSON.stringify(office.snapshot()).includes('🙂'));
  assert.ok(!JSON.stringify([...office.members.values()]).includes('🙂'));
  config.discord!.message_previews = false; office.discordMessage('discord-1', 'Commons', 'private'); assert.equal(bubbles.length, 1);
});
test('offline hide/grey and new-member welcome timeout work', () => {
  const { office, config, advance, arrive } = fixture(); office.discordPresence('discord-1', 'offline');
  config.discord!.offline_behavior = 'hide'; assert.equal(office.snapshot().members.length, 0);
  config.discord!.offline_behavior = 'grey'; assert.equal(office.snapshot().members[0].presence, 'offline');
  office.upsertDiscord({ id: 'new', username: 'New', avatar: null }, 'online', true);
  assert.equal(office.members.get('new')!.room, 'Front Office'); advance(10000);
  for (let i = 0; i < 1000 && office.members.get('new')!.path.length; i++) advance(50);
  assert.equal(office.members.get('new')!.room, 'Commons');
  arrive();
});
