import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Identity } from './protocol.js';
import { OAuthRateLimitError, readOAuthCooldown } from './oauth-rate-limit.js';
export interface AuthOptions { clientId: string; clientSecret: string; redirectUri: string; guildId: string; secret: string; webUrl: string; mock: boolean }
interface Session { user: Identity; expires: number }
interface Flow { verifier: string; expires: number }
export class Auth {
  private sessions = new Map<string, Session>();
  private flows = new Map<string, Flow>();
  private cookieName = 'office_session';
  private oauthRetryAt = 0;
  constructor(public options: AuthOptions, private request: typeof fetch = fetch, private now = () => Date.now(), public onInvalidate: (id: string) => void = () => {}) {}
  allowedOrigin(origin?: string) {
    const url = new URL(this.options.webUrl); if (origin === url.origin) return true;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') { url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'; return origin === url.origin; }
    return false;
  }
  private sign(id: string) { return createHmac('sha256', this.options.secret).update(id).digest('base64url'); }
  private pack(id: string) { return `${id}.${this.sign(id)}`; }
  private unpack(value?: string): string | undefined {
    if (!value) return;
    const [id, mac, extra] = value.split('.'); if (!id || !mac || extra) return;
    const expected = Buffer.from(this.sign(id)), actual = Buffer.from(mac);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return id;
  }
  private cookie(req: IncomingMessage, name: string) { return req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1); }
  private setCookie(res: ServerResponse, name: string, value: string, seconds: number) {
    const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(this.options.webUrl).protocol === 'https:' ? '; Secure' : ''}`;
    const previous = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [String(previous)] : []), cookie]);
  }
  session(req: IncomingMessage): Identity | undefined {
    const id = this.unpack(this.cookie(req, this.cookieName)); if (!id) return;
    const session = this.sessions.get(id);
    if (!session || session.expires <= this.now()) { this.sessions.delete(id); return; }
    return session.user;
  }
  createSession(user: Identity, res: ServerResponse) {
    for (const [id, session] of this.sessions) if (session.user.id === user.id) this.sessions.delete(id);
    this.onInvalidate(user.id);
    this.sweep(); if (this.sessions.size >= 2000) throw new Error('Office session capacity reached');
    const id = randomBytes(32).toString('base64url'); this.sessions.set(id, { user, expires: this.now() + 8 * 60 * 60 * 1000 });
    this.setCookie(res, this.cookieName, this.pack(id), 8 * 60 * 60);
  }
  sweep() {
    for (const [id, s] of this.sessions) if (s.expires <= this.now()) this.sessions.delete(id);
    for (const [id, f] of this.flows) if (f.expires <= this.now()) this.flows.delete(id);
  }
  revokeUser(userId: string) { for (const [id, session] of this.sessions) if (session.user.id === userId) this.sessions.delete(id); this.onInvalidate(userId); }
  private redirect(res: ServerResponse, url: string) { res.writeHead(302, { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); }
  private json(res: ServerResponse, data: unknown, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  private retryAfterSeconds() { return Math.max(0, Math.ceil((this.oauthRetryAt - this.now()) / 1000)); }
  private cooldownRedirect(res: ServerResponse) {
    res.setHeader('Retry-After', String(this.retryAfterSeconds()));
    this.redirect(res, `${this.options.webUrl}/?login_error=rate_limited`);
  }
  private async oauthRequest(url: string, init: RequestInit) {
    const response = await this.request(url, init);
    if (response.status === 429) {
      const cooldown = await readOAuthCooldown(response, this.now());
      this.oauthRetryAt = Math.max(this.oauthRetryAt, this.now() + cooldown.retryAfterSeconds * 1000);
      throw new OAuthRateLimitError(cooldown);
    }
    return response;
  }
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    if (path === '/api/session' && req.method === 'GET') {
      let user = this.session(req);
      if (this.options.mock && !user) { user = { id: `guest-${randomBytes(6).toString('hex')}`, username: 'You (demo)', avatar: '/avatars/0.svg' }; this.createSession(user, res); }
      this.json(res, { user: user ?? null, mode: this.options.mock ? 'mock' : 'multiplayer', loginRetryAfterSeconds: this.retryAfterSeconds() }); return true;
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      if (!this.allowedOrigin(req.headers.origin)) { this.json(res, { error: 'Invalid origin' }, 403); return true; }
      const id = this.unpack(this.cookie(req, this.cookieName)), user = this.session(req);
      if (id) this.sessions.delete(id); if (user) this.onInvalidate(user.id);
      this.setCookie(res, this.cookieName, '', 0); this.json(res, { ok: true }); return true;
    }
    if (path === '/auth/login' && req.method === 'GET') {
      if (this.options.mock) { this.redirect(res, this.options.webUrl); return true; }
      if (this.retryAfterSeconds() > 0) { this.cooldownRedirect(res); return true; }
      this.sweep(); if (this.flows.size >= 1000) { this.json(res, { error: 'Too many login attempts. Try again shortly.' }, 429); return true; }
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      this.flows.set(state, { verifier, expires: this.now() + 5 * 60 * 1000 });
      this.setCookie(res, 'office_oauth', this.pack(state), 300);
      const authorize = new URL('https://discord.com/oauth2/authorize');
      authorize.search = new URLSearchParams({ client_id: this.options.clientId, response_type: 'code', redirect_uri: this.options.redirectUri, scope: 'identify guilds', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      this.redirect(res, authorize.toString()); return true;
    }
    if (path === '/auth/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') ?? '', bound = this.unpack(this.cookie(req, 'office_oauth')), flow = this.flows.get(state);
      this.setCookie(res, 'office_oauth', '', 0);
      if (!state || bound !== state || !flow || flow.expires <= this.now()) { this.redirect(res, `${this.options.webUrl}/?login_error=invalid_state`); return true; }
      this.flows.delete(state);
      if (url.searchParams.has('error') || !url.searchParams.get('code')) { this.redirect(res, `${this.options.webUrl}/?login_error=cancelled`); return true; }
      if (this.retryAfterSeconds() > 0) { this.cooldownRedirect(res); return true; }
      let stage = 'token_exchange', status: number | null = null, reason = 'request_failed';
      try {
        const tokenResponse = await this.oauthRequest('https://discord.com/api/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ client_id: this.options.clientId, client_secret: this.options.clientSecret, grant_type: 'authorization_code', code: url.searchParams.get('code')!, redirect_uri: this.options.redirectUri, code_verifier: flow.verifier })
        });
        status = tokenResponse.status;
        if (!tokenResponse.ok) { reason = 'http_error'; throw new Error('Exchange failed'); }
        reason = 'invalid_token_response';
        const token = await tokenResponse.json() as { access_token?: string; scope?: string };
        if (!token.access_token || !['identify', 'guilds'].every(scope => token.scope?.split(' ').includes(scope))) throw new Error('Missing scopes');
        const headers = { Authorization: `Bearer ${token.access_token}` };
        stage = 'profile'; status = null; reason = 'request_failed';
        const profileResponse = await this.oauthRequest('https://discord.com/api/v10/users/@me', { headers, signal: AbortSignal.timeout(10000) });
        status = profileResponse.status;
        if (!profileResponse.ok) { reason = 'http_error'; throw new Error('Profile request failed'); }
        reason = 'invalid_profile_response';
        const profile = await profileResponse.json() as { id: string; username: string; global_name?: string; avatar?: string; discriminator?: string };
        let member = false, after = '';
        for (let page = 0; page < 10; page++) {
          stage = 'guild_list'; status = null; reason = 'request_failed';
          const response = await this.oauthRequest(`https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`, { headers, signal: AbortSignal.timeout(10000) });
          status = response.status;
          if (!response.ok) { reason = 'http_error'; throw new Error('Membership request failed'); }
          reason = 'invalid_guild_response';
          const guilds = await response.json() as { id: string }[];
          if (guilds.some(g => g.id === this.options.guildId)) { member = true; break; }
          if (guilds.length < 200) break;
          after = guilds.at(-1)!.id;
        }
        if (!member) { this.redirect(res, `${this.options.webUrl}/?login_error=not_member`); return true; }
        stage = 'identity'; status = null; reason = 'invalid_identity';
        if (!/^\d+$/.test(profile.id) || typeof profile.username !== 'string') throw new Error('Invalid identity');
        const defaultAvatar = Number((BigInt(profile.id) >> 22n) % 6n);
        const avatar = profile.avatar && /^[a-zA-Z0-9_]+$/.test(profile.avatar) ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`;
        stage = 'session'; reason = 'session_creation_failed';
        this.createSession({ id: profile.id, username: profile.global_name || profile.username, avatar }, res);
        this.redirect(res, this.options.webUrl);
      } catch (error) {
        if (error instanceof OAuthRateLimitError) {
          console.error('[oauth] login_failed', JSON.stringify({ stage, status: 429, reason: 'rate_limited', ...error.cooldown, retryAt: new Date(this.oauthRetryAt).toISOString() }));
          this.cooldownRedirect(res); return true;
        }
        if (error instanceof Error && error.name === 'TimeoutError') reason = 'timeout';
        // Only our fixed labels and HTTP status: never log provider bodies,
        // request URLs, credentials, cookies, authorization codes, or tokens.
        console.error('[oauth] login_failed', JSON.stringify({ stage, status, reason }));
        this.redirect(res, `${this.options.webUrl}/?login_error=failed`);
      }
      // Access/refresh tokens are local variables only; never sent to the client or retained.
      return true;
    }
    return false;
  }
}
