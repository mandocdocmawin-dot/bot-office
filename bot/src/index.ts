import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { ROOT, loadConfig } from './config.js';
import { Office } from './office.js';
import { OptOuts } from './optouts.js';
import { startMock } from './mock.js';
import { connectDiscord } from './discord.js';
dotenv.config({ path: resolve(ROOT, '.env'), quiet: true });
const mock = process.argv.includes('--mock');
const config = loadConfig();
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const allowedOrigins = new Set([new URL(webUrl).origin, 'http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${port}`, `http://127.0.0.1:${port}`]);
if (!mock && (!process.env.DISCORD_TOKEN || !process.env.GUILD_ID)) throw new Error('Set DISCORD_TOKEN and GUILD_ID in .env, or run npm run mock');
const optouts = new OptOuts(resolve(ROOT, 'bot/data'));
// Mock never reads or writes the real members' privacy data.
if (!mock) await optouts.load();
const webRoot = resolve(ROOT, 'web/dist');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ mode: office.mode, ready: office.ready, members: office.snapshot().members.length })); return; }
  try {
    const file = resolve(webRoot, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    if (!file.startsWith(webRoot + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Run the Vite client on http://localhost:5173, or npm run build to serve it here.'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const office = new Office(config, mock ? 'mock' : 'discord', optouts.ids, event => {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) {
    if (client.bufferedAmount > 1_000_000) client.terminate(); else client.send(payload);
  }
});
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws' || (req.headers.origin && !allowedOrigins.has(req.headers.origin))) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client, req));
});
wss.on('connection', socket => {
  socket.on('error', () => {});
  socket.send(JSON.stringify({ type: 'snapshot', state: office.snapshot() }));
});
const tick = setInterval(() => office.tick(), 1000);
const alive = new WeakSet<WebSocket>();
const heartbeat = setInterval(() => {
  for (const client of wss.clients) { if (!alive.has(client)) { client.terminate(); continue; } alive.delete(client); client.ping(); }
}, 30000);
wss.on('connection', client => { alive.add(client); client.on('pong', () => alive.add(client)); });
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Office ${mock ? 'mock' : 'Discord'} server: http://localhost:${port} · WebSocket /ws`));
let stop: (() => void) | undefined;
try { stop = mock ? startMock(office) : await connectDiscord(office, optouts, process.env.GUILD_ID!, process.env.DISCORD_TOKEN!, webUrl); }
catch (error) { console.error('Discord login failed:', error instanceof Error ? error.message : 'Unknown error'); shutdown(); process.exitCode = 1; }
function shutdown() { stop?.(); clearInterval(tick); clearInterval(heartbeat); for (const client of wss.clients) client.terminate(); wss.close(); server.close(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
