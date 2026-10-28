import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { ROOT, loadConfig } from './config.js';
import { createOfficeServer } from './app.js';
dotenv.config({ path: resolve(ROOT, '.env'), quiet: true });
const mock = process.argv.includes('--mock'), port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const required = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'GUILD_ID', 'SESSION_SECRET'];
if (!mock) {
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Set ${missing.join(', ')} in root .env, or run npm run mock`);
  if (process.env.SESSION_SECRET!.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
  new URL(process.env.DISCORD_REDIRECT_URI!);
}
const app = createOfficeServer(loadConfig(), {
  clientId: process.env.DISCORD_CLIENT_ID ?? '', clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '', redirectUri: process.env.DISCORD_REDIRECT_URI ?? '',
  guildId: process.env.GUILD_ID ?? '', secret: mock ? randomBytes(32).toString('hex') : process.env.SESSION_SECRET!, webUrl: (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, ''), mock
});
app.server.on('error', error => { console.error(error.message); void app.close(); process.exitCode = 1; });
app.server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Office ${mock ? 'mock' : 'multiplayer'} server: http://localhost:${port}`));
process.once('SIGINT', () => { void app.close(); }); process.once('SIGTERM', () => { void app.close(); });
