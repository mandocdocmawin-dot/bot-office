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
async function fixture(nonMember = false, failExchange = false) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const provider = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url); requests.push({ url: path, init });
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
