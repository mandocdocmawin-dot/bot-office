import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivitySpeaking } from '../../web/src/speaking.js';
import type { Member } from './protocol.js';

const member = (changes: Partial<Member> = {}): Member => ({
  id: '1', username: 'Speaker', avatar: null, x: 0, y: 0, room: 'Commons',
  sleeping: false, moving: false, inVoice: true, voiceChannelId: 'general',
  muted: false, speaking: false, ...changes,
});

test('Activity start survives server updates; stop only briefly masks a bot signal', () => {
  let now = 0;
  const signals = new ActivitySpeaking(() => now);
  const serverMember = member({ speaking: true });
  signals.set('1', true, 'general');
  assert.equal(signals.apply([member()])[0].speaking, true);
  assert.equal(signals.apply([member()])[0].speaking, true);
  signals.set('1', false, 'general');
  assert.equal(signals.apply([serverMember])[0].speaking, false);
  assert.equal(serverMember.speaking, true, 'the underlying server signal must stay intact');
  now = 199;
  assert.equal(signals.apply([serverMember])[0].speaking, false);
  now = 200;
  assert.equal(signals.apply([serverMember])[0].speaking, true, 'a missed SDK start must not suppress the bot for seconds');
  signals.clear();
  assert.equal(signals.apply([member()])[0].speaking, false);
  assert.equal(signals.apply([member({ speaking: true })])[0].speaking, true);
});

test('mute, leave, channel changes and removed members discard old Activity signals', () => {
  for (const changes of [{ muted: true }, { inVoice: false }, { voiceChannelId: 'other' }]) {
    const signals = new ActivitySpeaking();
    signals.set('1', true, 'general');
    signals.apply([member()]);
    assert.equal(signals.apply([member(changes)])[0].speaking, false);
    assert.equal(signals.apply([member()])[0].speaking, false);
  }
  const signals = new ActivitySpeaking();
  signals.set('1', true, 'general'); signals.apply([member()]); signals.apply([]);
  assert.equal(signals.apply([member()])[0].speaking, false);
});

test('a start arriving before membership lights up on the first matching snapshot', () => {
  let now = 0;
  const signals = new ActivitySpeaking(() => now);
  signals.set('1', true, 'general');
  signals.apply([]);
  assert.equal(signals.apply([member({ inVoice: false, voiceChannelId: undefined })])[0].speaking, false);
  now = 1000;
  assert.equal(signals.apply([member()])[0].speaking, true);
});

test('an unmatched early start expires and cannot light up a later call', () => {
  let now = 0;
  const signals = new ActivitySpeaking(() => now);
  signals.set('1', true, 'general');
  signals.apply([]);
  now = 1500;
  assert.equal(signals.apply([member()])[0].speaking, false);
});

test('members without Activity signals keep their bot speaking state', () => {
  const signals = new ActivitySpeaking();
  signals.set('1', true, 'general');
  assert.equal(signals.apply([member({ id: '2', speaking: true })])[0].speaking, true);
});
