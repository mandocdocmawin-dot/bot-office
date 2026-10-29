import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardMovement, movementDirection, movementKey } from '../../web/src/keyboard-movement.js';
import type { Point } from './protocol.js';

test('press, turn and release dispatch immediately without waiting for a heartbeat', () => {
  const sent: Point[] = [];
  const controls = new KeyboardMovement(direction => sent.push(direction));
  controls.press('d');
  assert.deepEqual(sent, [movementDirection(new Set(['d']))]);
  controls.press('w');
  assert.deepEqual(sent.at(-1), movementDirection(new Set(['d', 'w'])));
  controls.release('d');
  assert.deepEqual(sent.at(-1), movementDirection(new Set(['w'])));
  controls.release('w');
  assert.deepEqual(sent.at(-1), { x: 0, y: 0 });
  assert.equal(sent.length, 4);
});

test('held input renews its lease; repeats, duplicate bindings and idle do not flood', () => {
  const sent: Point[] = [];
  const controls = new KeyboardMovement(direction => sent.push(direction));
  controls.heartbeat(); assert.equal(sent.length, 0);
  controls.press('w'); controls.press('w'); controls.press('arrowup');
  assert.equal(sent.length, 1);
  controls.release('w'); assert.equal(sent.length, 1);
  controls.heartbeat(); assert.equal(sent.length, 2);
  controls.clear(); assert.deepEqual(sent.at(-1), { x: 0, y: 0 });
  const count = sent.length;
  // A delayed key release after click-to-move must not send another stop.
  controls.release('arrowup'); controls.heartbeat(); controls.clear();
  assert.equal(sent.length, count);
});

test('all eight directions match screen axes and keep world speed normalized', () => {
  for (const [keys, sx, sy] of [
    [['d'], 1, 0], [['a'], -1, 0], [['s'], 0, 1], [['w'], 0, -1],
    [['d', 'w'], 1, -1], [['d', 's'], 1, 1], [['a', 'w'], -1, -1], [['a', 's'], -1, 1],
  ] as [string[], number, number][]) {
    const { x, y } = movementDirection(new Set(keys));
    assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-12);
    const screenX = .86 * (x - y), screenY = .43 * (x + y);
    assert.ok(Math.abs(screenX * sy - screenY * sx) < 1e-12, `${keys} must follow the screen direction`);
    assert.ok(screenX * sx + screenY * sy > 0);
  }
  assert.deepEqual(movementDirection(new Set(['w', 's', 'a', 'd'])), { x: 0, y: 0 });
  assert.deepEqual(movementDirection(new Set(['w'])), movementDirection(new Set(['arrowup'])));
});

test('physical key codes survive Shift and keyboard layouts, with a key fallback', () => {
  assert.equal(movementKey({ code: 'KeyW', key: 'W' }), 'w');
  assert.equal(movementKey({ code: 'KeyW', key: 'z' }), 'w');
  assert.equal(movementKey({ code: 'KeyZ', key: 'w' }), undefined);
  assert.equal(movementKey({ key: 'ArrowLeft' }), 'arrowleft');
  assert.equal(movementKey({ key: 'W' }), 'w');
  assert.equal(movementKey({ code: 'Enter', key: 'Enter' }), undefined);
});
