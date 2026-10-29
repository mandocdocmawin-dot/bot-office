import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOAuthCooldown } from './oauth-rate-limit.js';

test('Discord cooldown uses the longest valid seconds value and rounds up', async () => {
  const result = await readOAuthCooldown(Response.json({ retry_after: 2.25, code: 20028, message: 'do-not-log' }, { status: 429, headers: { 'Retry-After': '3.5', 'X-RateLimit-Reset-After': '1', 'X-RateLimit-Scope': 'shared' } }), Date.now());
  assert.deepEqual(result, { retryAfterSeconds: 4, retrySource: 'discord', responseType: 'json', scope: 'shared', providerCode: 20028 });
});
test('HTML rate limits support HTTP dates without retaining response bodies', async () => {
  const now = Date.parse('2026-10-29T02:31:00Z');
  const result = await readOAuthCooldown(new Response('<html>private-response</html>', { status: 429, headers: { 'Content-Type': 'text/html', 'Retry-After': 'Thu, 29 Oct 2026 02:33:00 GMT' } }), now);
  assert.deepEqual(result, { retryAfterSeconds: 120, retrySource: 'discord', responseType: 'html' });
});
test('missing, invalid and malformed rate-limit data use a conservative fallback', async () => {
  for (const response of [
    new Response('bad JSON', { status: 429, headers: { 'Content-Type': 'application/json' } }),
    Response.json({ retry_after: -1, code: 'sensitive string', global: 'true' }, { status: 429, headers: { 'Retry-After': 'not-a-date', 'X-RateLimit-Scope': 'sensitive string' } }),
    Response.json({ retry_after: null }, { status: 429 }),
  ]) {
    const result = await readOAuthCooldown(response, Date.now());
    assert.deepEqual(result, { retryAfterSeconds: 60, retrySource: 'fallback', responseType: 'json' });
  }
});
