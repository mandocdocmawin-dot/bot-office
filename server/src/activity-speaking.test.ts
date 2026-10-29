import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivitySpeaking } from '../../web/src/speaking.js';
import type { Member } from './protocol.js';

const member = (changes: Partial<Member> = {}): Member => ({
  id: '1', username: 'Speaker', avatar: null, x: 0, y: 0, room: 'Commons',
  sleeping: false, moving: false, inVoice: true, voiceChannelId: 'general',
  muted: false, speaking: false, ...changes,
});

test('Activity start survives server updates; stop overrides a stale bot signal', () => {
  const signals = new ActivitySpeaking();
  signals.set('1', true, 'general');
  assert.equal(signals.apply([member()])[0].speaking, true);
  assert.equal(signals.apply([member()])[0].speaking, true);
  signals.set('1', false, 'general');
  assert.equal(signals.apply([member({ speaking: true })])[0].speaking, false);
  signals.clear();
  assert.equal(signals.apply([member()])[0].speaking, false);
  assert.equal(signals.apply([member({ speaking: true })])[0].speaking, true);
});

test('mute, leave, channel changes and removed members discard old Activity signals', () => {
  for (const changes of [{ muted: true }, { inVoice: false }, { voiceChannelId: 'other' }]) {
    const signals = new ActivitySpeaking();
    signals.set('1', true, 'general');
    assert.equal(signals.apply([member(changes)])[0].speaking, false);
    assert.equal(signals.apply([member()])[0].speaking, false);
  }
  const signals = new ActivitySpeaking();
  signals.set('1', true, 'general'); signals.apply([]);
  assert.equal(signals.apply([member()])[0].speaking, false);
});

test('members without Activity signals keep their bot speaking state', () => {
  const signals = new ActivitySpeaking();
  signals.set('1', true, 'general');
  assert.equal(signals.apply([member({ id: '2', speaking: true })])[0].speaking, true);
});
