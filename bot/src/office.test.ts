import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateConfig } from './config.js';
import { Office } from './office.js';
import { OptOuts } from './optouts.js';
import type { WireEvent } from './protocol.js';
const fixture = () => {
  let time = 1000; const events: WireEvent[] = []; const config = loadConfig();
  const office = new Office(config, 'mock', new Set(), e => events.push(e), () => time);
  office.add({ id: '1', username: '<script>hello</script>', avatar: null, presence: 'online' });
  return { office, config, events, advance: (ms: number) => { time += ms; office.tick(); } };
};
test('message stays two minutes, returns to Commons, then naps and wakes', () => {
  const { office, config, advance } = fixture();
  office.activity('1', 'Tech Lab', 'message', 'hello');
  advance(config.message_stay_ms - 1); assert.equal(office.snapshot().members[0].room, 'Tech Lab');
  advance(1); assert.equal(office.snapshot().members[0].room, 'Commons');
  advance(config.idle_timeout_ms - config.message_stay_ms); assert.equal(office.snapshot().members[0].room, 'Nap Room');
  assert.equal(office.snapshot().members[0].sleeping, true);
  office.activity('1', 'Studio', 'message'); assert.equal(office.snapshot().members[0].sleeping, false);
});
test('new members visit Front Office for ten seconds', () => {
  const { office, config, advance } = fixture();
  office.add({ id: '2', username: 'New', avatar: null, presence: 'online' }, true);
  assert.equal(office.members.get('2')!.room, 'Front Office');
  advance(config.new_member_stay_ms); assert.equal(office.members.get('2')!.room, 'Commons');
});
test('forum thread parent and unmapped channel routing', () => {
  const { office, events } = fixture();
  assert.equal(office.textRoom('thread-123', 'SHARE_PROJECTS_FORUM_ID'), 'Showcase');
  assert.equal(office.textRoom('unknown'), 'Commons');
  office.activity('1', office.textRoom('thread', 'SHARE_PROJECTS_FORUM_ID'), 'thread_create');
  assert.equal(events.at(-1)!.type, 'thread_create'); assert.equal(office.members.get('1')!.room, 'Showcase');
});
test('dynamic voice routing excludes main General, voice wins over messages and idle', () => {
  const { office, advance, config } = fixture();
  assert.equal(office.voiceRoom('GENERAL_VOICE_CHANNEL_ID', 'CALL FOR VOICE'), 'Commons');
  assert.equal(office.voiceRoom('dynamic-new-id', 'CALL FOR VOICE'), 'Meeting Room');
  assert.equal(office.voiceRoom('other-id', 'OTHER'), 'Commons');
  office.voice('1', 'Meeting Room'); office.activity('1', 'Studio', 'message', 'hello');
  advance(config.idle_timeout_ms * 2); assert.equal(office.members.get('1')!.room, 'Meeting Room');
  assert.equal(office.members.get('1')!.sleeping, false);
  office.voice('1', null); assert.equal(office.members.get('1')!.room, 'Commons');
});
test('offline hide/grey and opt-outs filter both snapshots and event metadata', () => {
  const { office, events, config } = fixture();
  office.presence('1', 'offline'); assert.equal(office.snapshot().members.length, 0);
  config.offline_behavior = 'grey'; assert.equal(office.snapshot().members[0].presence, 'offline');
  office.optedOut.add('1'); office.activity('1', 'Studio', 'message', 'PRIVATE');
  assert.equal(office.snapshot().members.length, 0);
  assert.equal(events.at(-1)!.memberId, undefined); assert.equal(events.at(-1)!.bubble, undefined);
  assert.equal(JSON.stringify(events.at(-1)).includes('PRIVATE'), false);
});
test('content is transient, Unicode truncation is safe, bubble switch respected', () => {
  const { office, events, config } = fixture();
  office.activity('1', 'Commons', 'message', '🙂'.repeat(70));
  assert.equal(Array.from(events.at(-1)!.bubble!).length, 40);
  assert.equal(JSON.stringify(office.snapshot()).includes('🙂'), false);
  assert.equal(JSON.stringify([...office.members.values()]).includes('🙂'), false);
  config.bubble_enabled = false; office.activity('1', 'Commons', 'message', 'PRIVATE');
  assert.equal(events.at(-1)!.bubble, undefined);
});
test('opt-outs survive reload and concurrent changes do not overwrite each other', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'office-test-'));
  try {
    const store = new OptOuts(directory); await store.load();
    await Promise.all([store.set('1', true), store.set('2', true), store.set('3', true)]);
    const restored = new OptOuts(directory); await restored.load(); assert.deepEqual([...restored.ids], ['1', '2', '3']);
    await restored.set('2', false); assert.deepEqual(JSON.parse(await readFile(join(directory, 'optouts.json'), 'utf8')), ['1', '3']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('configuration rejects malformed mappings and privacy settings', () => {
  const config = loadConfig();
  assert.throws(() => validateConfig({ ...config, offline_behavior: 'visible' }));
  assert.throws(() => validateConfig({ ...config, idle_timeout_ms: -1 }));
  assert.throws(() => validateConfig({ ...config, channels: [{ id: 'test', room: 'Not a room' }] }));
});
test('member leave identifies visible departures without exposing opt-outs', () => {
  const { office, events } = fixture();
  office.remove('1'); assert.equal(events.at(-1)!.type, 'member_leave'); assert.equal(events.at(-1)!.memberId, '1');
  office.add({ id: '2', username: 'Hidden', avatar: null, presence: 'online' }); office.optedOut.add('2');
  office.remove('2'); assert.equal(events.at(-1)!.memberId, undefined);
});
test('a rejoining cached member receives a fresh welcome visit', () => {
  const { office, config, advance } = fixture(); office.voice('1', 'Meeting Room');
  office.add({ id: '1', username: 'Returned', avatar: null, presence: 'online' }, true);
  assert.equal(office.members.get('1')!.room, 'Front Office'); assert.equal(office.members.get('1')!.inVoice, false);
  advance(config.new_member_stay_ms); assert.equal(office.members.get('1')!.room, 'Commons');
});
