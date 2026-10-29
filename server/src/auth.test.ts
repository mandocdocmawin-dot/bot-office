import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createOfficeServer } from './app.js';
import { loadConfig } from './config.js';
import type { AuthOptions } from './auth.js';
import type { Packet } from './protocol.js';
const options: AuthOptions = { clientId: 'test-client', clientSecret: 'server-only-secret', redirectUri: 'http://localhost:5173/auth/callback', guildId: 'server-1', secret: 'test-session-secret-with-more-than-32-characters', webUrl: 'http://localhost:5173', mock: false };
const cookie = (response: Response, name: string) => response.headers.getSetCookie().find(v => v.startsWith(`${name}=`))!.split(';')[0];
async function fixture(nonMember = false, failExchange = false, rateLimit?: { stage: 'token_exchange' | 'profile' | 'guild_list'; response: () => Response | Promise<Response> }) {
  const requests: { url: string; init?: RequestInit }[] = [];
  let limited = !!rateLimit;
  const provider = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url); requests.push({ url: path, init });
    const stage = path.endsWith('/oauth2/token') ? 'token_exchange' : path.endsWith('/users/@me') ? 'profile' : 'guild_list';
    if (limited && stage === rateLimit?.stage) { limited = false; return rateLimit.response(); }
    if (path.endsWith('/oauth2/token')) {
      if (failExchange) return new Response('{}', { status: 400 });
      const body = init!.body as URLSearchParams; assert.equal(body.get('client_secret'), options.clientSecret); assert.ok(body.get('code_verifier'));
      return Response.json({ access_token: body.get('code') ?? '123', scope: 'identify guilds' });
    }
    const id = (init?.headers as Record<string, string>)?.Authorization.replace('Bearer ', '') ?? '123';
    if (path.endsWith('/users/@me')) return Response.json({ id, username: `User ${id}`, global_name: `Display ${id}`, avatar: null });
    if (path.includes('/users/@me/guilds')) return Response.json([{ id: nonMember ? 'other-server' : 'server-1' }]);
    throw new Error('Unexpected OAuth endpoint');
  }) as typeof fetch;
  const app = createOfficeServer(loadConfig(), options, provider);
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  async function begin() {
    const start = await fetch(`${base}/auth/login`, { redirect: 'manual' });
    const redirect = new URL(start.headers.get('location')!); assert.equal(redirect.origin, 'https://discord.com'); assert.equal(redirect.searchParams.get('scope'), 'identify guilds'); assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(!redirect.toString().includes(options.clientSecret));
    return { state: redirect.searchParams.get('state')!, cookie: cookie(start, 'office_oauth') };
  }
  async function login(id = '123') {
    const flow = await begin(); const callback = await fetch(`${base}/auth/callback?state=${flow.state}&code=${id}`, { redirect: 'manual', headers: { Cookie: flow.cookie } });
    return { callback, flow, cookie: callback.headers.getSetCookie().some(c => c.startsWith('office_session=')) ? cookie(callback, 'office_session') : '' };
  }
  async function socket(session: string) { const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, { headers: { Cookie: session, Origin: options.webUrl } }); const initial = packet(ws, p => p.type === 'snapshot'); await once(ws, 'open'); return { ws, initial: await initial }; }
  return { app, base, requests, begin, login, socket };
}
function packet(ws: WebSocket, match: (p: Packet) => boolean): Promise<Packet> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('Packet timeout')); }, 3000);
    const listener = (raw: Buffer) => { const p = JSON.parse(raw.toString()) as Packet; if (match(p)) { clearTimeout(timer); ws.off('message', listener); resolve(p); } };
    ws.on('message', listener);
  });
}
test('OAuth authorization, server exchange, membership verification and signed session work together', async () => {
  const f = await fixture();
  try {
    const { callback, cookie: session } = await f.login(); assert.equal(callback.status, 302); assert.equal(callback.headers.get('location'), options.webUrl);
    const header = callback.headers.getSetCookie().find(c => c.startsWith('office_session='))!; assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/);
    const result = await (await fetch(`${f.base}/api/session`, { headers: { Cookie: session } })).json();
    assert.equal(result.user.username, 'Display 123'); assert.ok(!JSON.stringify(result).includes('access_token')); assert.ok(!session.includes('123'));
    const { ws, initial } = await f.socket(session); assert.equal(initial.type, 'snapshot'); assert.equal(f.app.office.members.get('123')!.room, 'Front Office'); ws.close();
    assert.ok(f.requests.some(r => r.url.includes('/users/@me/guilds')));
  } finally { await f.app.close(); }
});
test('non-members are rejected without a session and provider errors fail closed', async () => {
  for (const [nonMember, failed, expected] of [[true, false, 'not_member'], [false, true, 'failed']] as const) {
    const f = await fixture(nonMember, failed);
    try { const result = await f.login(); assert.ok(result.callback.headers.get('location')!.includes(`login_error=${expected}`)); assert.equal(result.cookie, ''); } finally { await f.app.close(); }
  }
});
test('OAuth failures log the failing stage and status without credentials or callback data', async t => {
  const log = t.mock.method(console, 'error', () => {});
  const f = await fixture(false, true);
  try {
    const result = await f.login('private-authorization-code');
    assert.ok(result.callback.headers.get('location')!.includes('login_error=failed'));
    assert.equal(result.cookie, '');
    assert.equal(log.mock.calls.length, 1);
    const [prefix, details] = log.mock.calls[0].arguments as unknown as [string, string];
    assert.equal(prefix, '[oauth] login_failed');
    assert.deepEqual(JSON.parse(details), { stage: 'token_exchange', status: 400, reason: 'http_error' });
    const output = JSON.stringify(log.mock.calls.map(call => call.arguments));
    for (const privateValue of [options.clientSecret, options.secret, result.flow.state, result.flow.cookie, 'private-authorization-code']) assert.ok(!output.includes(privateValue));
  } finally { await f.app.close(); }
});
test('Discord 429s stop new logins and pending callbacks until cooldown expires, then permit a fresh login', async t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const stage of ['token_exchange', 'profile', 'guild_list'] as const) {
    const f = await fixture(false, false, { stage, response: () => Response.json({ retry_after: .01, global: true, message: 'private-provider-body' }, { status: 429 }) });
    try {
      const pending = await f.begin();
      const first = await f.login();
      assert.equal(first.callback.headers.get('location'), `${options.webUrl}/?login_error=rate_limited`);
      assert.equal(first.cookie, '');
      assert.equal(first.callback.headers.get('retry-after'), '1');
      const requestCount = f.requests.length;
      const blocked = await fetch(`${f.base}/auth/login`, { redirect: 'manual' });
      assert.equal(blocked.headers.get('location'), `${options.webUrl}/?login_error=rate_limited`);
      const blockedCallback = await fetch(`${f.base}/auth/callback?state=${pending.state}&code=123`, { redirect: 'manual', headers: { Cookie: pending.cookie } });
      assert.equal(blockedCallback.headers.get('location'), `${options.webUrl}/?login_error=rate_limited`);
      assert.equal(f.requests.length, requestCount, 'cooldown must not send more Discord requests');
      const session = await (await fetch(`${f.base}/api/session`)).json();
      assert.equal(session.loginRetryAfterSeconds, 1);
      assert.equal(session.user, null);
      const details = JSON.parse(log.mock.calls.at(-1)!.arguments[1]);
      assert.equal(details.stage, stage); assert.equal(details.status, 429);
      assert.equal(details.reason, 'rate_limited'); assert.equal(details.retryAfterSeconds, 1);
      assert.equal(details.scope, 'global'); assert.ok(!JSON.stringify(details).includes('private-provider-body'));
      await new Promise(resolve => setTimeout(resolve, 1100));
      const success = await f.login(); assert.ok(success.cookie); assert.equal(success.callback.headers.get('location'), options.webUrl);
    } finally { await f.app.close(); }
  }
});
test('state is browser-bound and single-use; forged cookies cannot authenticate', async () => {
  const f = await fixture();
  try {
    const flow = await f.begin();
    const unbound = await fetch(`${f.base}/auth/callback?state=${flow.state}&code=123`, { redirect: 'manual' }); assert.ok(unbound.headers.get('location')!.includes('invalid_state'));
    const result = await f.login();
    const replay = await fetch(`${f.base}/auth/callback?state=${result.flow.state}&code=123`, { headers: { Cookie: result.flow.cookie }, redirect: 'manual' }); assert.ok(replay.headers.get('location')!.includes('invalid_state'));
    const forged = await (await fetch(`${f.base}/api/session`, { headers: { Cookie: `${result.cookie}x` } })).json(); assert.equal(forged.user, null);
    const ws = new WebSocket(`${f.base.replace('http:', 'ws:')}/ws`, { headers: { Origin: options.webUrl } });
    await new Promise<void>(resolve => { ws.on('error', () => {}); ws.on('unexpected-response', (_req, res) => { assert.equal(res.statusCode, 401); res.resume(); ws.terminate(); resolve(); }); });
  } finally { await f.app.close(); }
});

test('concurrent callbacks stop dispatching as soon as an in-flight request returns 429', async t => {
  t.mock.method(console, 'error', () => {});
  let reachedProvider!: () => void, returnRateLimit!: () => void, reachedCallbacks!: () => void;
  const providerEntered = new Promise<void>(resolve => { reachedProvider = resolve; });
  const providerResponse = new Promise<void>(resolve => { returnRateLimit = resolve; });
  const callbacksEntered = new Promise<void>(resolve => { reachedCallbacks = resolve; });
  const f = await fixture(false, false, { stage: 'token_exchange', response: async () => {
    reachedProvider();
    await providerResponse;
    return Response.json({ retry_after: 1473 }, { status: 429 });
  } });
  try {
    const original = f.app.auth.handle.bind(f.app.auth);
    let callbacks = 0;
    t.mock.method(f.app.auth, 'handle', (req, res, url) => {
      const handled = original(req, res, url);
      if (url.pathname === '/auth/callback' && ++callbacks === 2) reachedCallbacks();
      return handled;
    });
    const [a, b] = await Promise.all([f.begin(), f.begin()]);
    const callback = (flow: typeof a) => fetch(`${f.base}/auth/callback?state=${flow.state}&code=123`, { redirect: 'manual', headers: { Cookie: flow.cookie } });
    const first = callback(a);
    await providerEntered;
    const second = callback(b);
    await callbacksEntered;
    assert.equal(f.requests.length, 1, 'only one provider request may be in flight');
    returnRateLimit();
    for (const response of await Promise.all([first, second])) {
      assert.equal(response.headers.get('location'), `${options.webUrl}/?login_error=rate_limited`);
      assert.ok(Number(response.headers.get('retry-after')) > 0);
      assert.ok(!response.headers.getSetCookie().some(value => value.startsWith('office_session=')));
    }
    assert.equal(f.requests.length, 1, 'queued callback must not contact Discord during cooldown');
  } finally { returnRateLimit(); await f.app.close(); }
});

test('an authenticated browser reuses its session without starting another OAuth flow', async () => {
  const f = await fixture();
  try {
    const session = (await f.login()).cookie;
    const count = f.requests.length;
    const response = await fetch(`${f.base}/auth/login`, { redirect: 'manual', headers: { Cookie: session } });
    assert.equal(response.headers.get('location'), options.webUrl);
    assert.equal(response.headers.getSetCookie().length, 0);
    assert.equal(f.requests.length, count);
  } finally { await f.app.close(); }
});

test('concurrent successful logins still finish after the provider queue is released', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(['123', '456', '789'].map(id => f.login(id)));
    for (const result of results) assert.ok(result.cookie);
    assert.equal(f.requests.length, 9);
  } finally { await f.app.close(); }
});
test('duplicate tabs replace old socket, reconnect restores position, logout invalidates session', async () => {
  const f = await fixture();
  try {
    const session = (await f.login()).cookie, first = (await f.socket(session)).ws;
    const p = f.app.office.members.get('123')!, location = f.app.office.world.spawn('Commons'); Object.assign(p, location, { room: 'Commons' });
    const replaced = once(first, 'close'); const second = (await f.socket(session)).ws; assert.equal((await replaced)[0], 4000);
    assert.equal(f.app.office.members.get('123')!.room, 'Commons');
    const closed = once(second, 'close'); second.close(); await closed;
    const third = (await f.socket(session)).ws; assert.equal(f.app.office.members.get('123')!.x, location.x);
    const loggedOut = once(third, 'close');
    const response = await fetch(`${f.base}/auth/logout`, { method: 'POST', headers: { Cookie: session, Origin: options.webUrl } }); assert.equal(response.status, 200); assert.equal((await loggedOut)[0], 4001);
    const current = await (await fetch(`${f.base}/api/session`, { headers: { Cookie: session } })).json(); assert.equal(current.user, null);
  } finally { await f.app.close(); }
});
test('chat broadcasts only to room occupants, snapshots omit text, and flooding is limited', async () => {
  const f = await fixture();
  try {
    const a = (await f.socket((await f.login('123')).cookie)).ws, b = (await f.socket((await f.login('456')).cookie)).ws, c = (await f.socket((await f.login('789')).cookie)).ws;
    Object.assign(f.app.office.members.get('789')!, f.app.office.world.spawn('Studio'), { room: 'Studio' });
    const received: Packet[] = []; c.on('message', raw => received.push(JSON.parse(raw.toString())));
    const message = packet(b, p => p.type === 'bubble'); a.send(JSON.stringify({ type: 'chat', text: 'room-only-secret' }));
    assert.equal((await message).type, 'bubble');
    await packet(c, p => p.type === 'state'); assert.ok(!received.some(p => p.type === 'bubble'));
    assert.ok(!JSON.stringify(f.app.office.snapshot()).includes('room-only-secret'));
    const limited = once(a, 'close'); for (let i = 0; i < 100; i++) a.send('{"type":"wake"}'); assert.equal((await limited)[0], 4008);
    b.close(); c.close();
  } finally { await f.app.close(); }
});
