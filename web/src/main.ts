import Phaser from 'phaser';
import type { Packet, Room, Snapshot } from '../../bot/src/protocol';
import { rooms, colorCSS } from './rooms';
import { OfficeScene } from './scene';
import './style.css';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" aria-label="Discord Office home"><span class="brand-mark">◉</span><span>discord<span class="brand-light">office</span></span></a>
    <span class="header-divider"></span><span id="server-name">The Discord Office</span>
    <div class="top-right"><span class="connection" id="connection" role="status">Connecting</span><button id="help" class="icon-button" aria-label="About the office">?</button></div>
  </header>
  <div class="workspace">
    <main>
      <div class="page-heading"><div><h1>A little closer together.</h1><p>Your server, under one roof. See where everyone’s hanging out.</p></div><span class="mode" id="mode">Connecting</span></div>
      <div class="map-shell"><div class="map-toolbar"><div><span class="live-dot"></span><strong>Office floor</strong><span class="floor-label">First floor</span></div><button id="fit" class="text-button">↗ Fit to view</button></div>
        <div id="map" role="img" aria-label="Live top-down office. Use the room roster to read members and select rooms."></div>
        <div id="map-notice" role="status" hidden></div>
        <div class="map-bottom"><span>Drag to explore <span class="hint-dot">·</span> Scroll to zoom</span><div class="zoom-controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-value">100%</output><button id="zoom-in" aria-label="Zoom in">+</button></div></div>
      </div>
      <footer class="map-footer"><span><i class="legend-dot available"></i>Online <i class="legend-dot voice"></i>In voice <i class="legend-dot away"></i>Away <i class="legend-dot nap"></i>Napping</span><span id="update-time">Waiting for the office…</span></footer>
    </main>
    <aside aria-label="Office room roster"><div class="roster-heading"><h2>In the office</h2><span id="total">0</span></div><p class="roster-subtitle" id="roster-subtitle">Finding your people…</p>
      <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Find a teammate" aria-label="Find a teammate"></label>
      <button class="all-rooms" id="all-rooms">All rooms <span>↗</span></button><div id="roster"></div>
      <div class="privacy-note"><span>◈</span><div><strong>Your space. Your choice.</strong><p>Use <code>/office action:optout</code> in Discord to hide from the map.</p><button id="bubbles" class="text-button" aria-pressed="true">Speech bubbles on</button></div></div>
    </aside>
  </div>
  <dialog id="help-dialog"><button id="close-help" class="icon-button" aria-label="Close help">×</button><h2>Welcome to the office.</h2><p>Send a message to visit a room for two minutes. Join a voice channel to stay with the call. After ten quiet minutes, your character heads to the Nap Room.</p><p>Drag the floor to pan, scroll to zoom, or select a room in the roster. Fit to view resets the camera.</p><p>Message previews disappear after three seconds. Hide them with the speech bubbles control. To hide yourself from everyone, use <code>/office action:optout</code> in Discord. Use <code>/office action:optin</code> to return.</p><p id="mode-help"></p></dialog>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const scene = new OfficeScene();
new Phaser.Game({ type: Phaser.AUTO, parent: 'map', backgroundColor: '#111823', scene, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, render: { antialias: true, roundPixels: false }, audio: { noAudio: true } });
let snapshot: Snapshot | undefined;
let selected: Room | undefined;
let localBubbles = localStorage.getItem('office-bubbles') !== 'off';
let query = '';
function renderRoster() {
  if (!snapshot) return;
  const roster = el('roster'); roster.replaceChildren();
  const total = snapshot.members.length;
  el('total').textContent = String(total);
  el('roster-subtitle').textContent = `${total} ${total === 1 ? 'teammate' : 'teammates'} across 9 rooms`;
  let results = 0;
  for (const room of rooms) {
    const all = snapshot.members.filter(m => m.room === room.name);
    const members = all.filter(m => m.username.toLocaleLowerCase().includes(query));
    if (query && !members.length) continue;
    if (selected && selected !== room.name) continue;
    const section = document.createElement('section'); section.className = 'room-section';
    const button = document.createElement('button'); button.className = 'room-button'; button.style.setProperty('--room-color', colorCSS(room.color));
    button.setAttribute('aria-pressed', String(selected === room.name));
    const dot = document.createElement('i'); dot.className = 'room-dot';
    const name = document.createElement('span'); name.textContent = room.name;
    const count = document.createElement('span'); count.className = 'room-count'; count.textContent = String(all.length);
    button.append(dot, name, count); button.onclick = () => selectRoom(selected === room.name ? undefined : room.name);
    section.append(button);
    if (!members.length) { const empty = document.createElement('p'); empty.className = 'empty-room'; empty.textContent = 'Room for a little company'; section.append(empty); }
    for (const member of members) {
      results++;
      const row = document.createElement('div'); row.className = `member-row ${member.presence === 'offline' ? 'offline' : ''}`;
      const avatar = document.createElement('span'); avatar.className = 'roster-avatar'; avatar.textContent = Array.from(member.username)[0] ?? '?';
      if (member.avatar) { const img = document.createElement('img'); img.src = member.avatar; img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.remove(); avatar.append(img); }
      const label = document.createElement('span'); label.className = 'member-name'; label.textContent = member.username;
      const state = document.createElement('span'); state.className = `member-state ${member.inVoice ? 'voice-text' : ''}`; state.textContent = member.sleeping ? 'Zzz' : member.inVoice ? 'In voice' : member.presence === 'online' ? '' : member.presence === 'dnd' ? 'Busy' : member.presence;
      row.append(avatar, label, state); section.append(row);
    }
    roster.append(section);
  }
  if (!results && query) { const empty = document.createElement('p'); empty.className = 'no-results'; empty.textContent = `No teammates match “${el<HTMLInputElement>('search').value}”.`; roster.append(empty); }
  el('all-rooms').classList.toggle('filtered', !!selected);
}
function selectRoom(room?: Room) { selected = room; scene.select(room); renderRoster(); }
function renderBubbleControl() {
  const enabled = localBubbles && snapshot?.config.bubbleEnabled !== false;
  el('bubbles').textContent = snapshot?.config.bubbleEnabled === false ? 'Speech bubbles disabled by server' : `Speech bubbles ${enabled ? 'on' : 'off'}`;
  el('bubbles').setAttribute('aria-pressed', String(enabled));
}
el('search').addEventListener('input', () => { query = el<HTMLInputElement>('search').value.trim().toLocaleLowerCase(); renderRoster(); });
el('all-rooms').onclick = () => selectRoom();
el('fit').onclick = () => scene.fit(); el('zoom-in').onclick = () => scene.zoom(0.2); el('zoom-out').onclick = () => scene.zoom(-0.2);
el('bubbles').onclick = () => { localBubbles = !localBubbles; localStorage.setItem('office-bubbles', localBubbles ? 'on' : 'off'); if (!localBubbles) scene.clearBubbles(); renderBubbleControl(); };
el('help').onclick = () => el<HTMLDialogElement>('help-dialog').showModal();
el('close-help').onclick = () => el<HTMLDialogElement>('help-dialog').close();
window.addEventListener('office-room', event => selectRoom((event as CustomEvent<Room>).detail));
window.addEventListener('office-zoom', event => { el('zoom-value').textContent = `${(event as CustomEvent<number>).detail}%`; });
renderBubbleControl();
let socket: WebSocket;
let retry = 0;
function connect() {
  const url = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => { retry = 0; el('connection').textContent = 'Connected'; el('connection').classList.add('connected'); };
  socket.onmessage = event => {
    let packet: Packet;
    try { packet = JSON.parse(event.data); if (!packet.state || !Array.isArray(packet.state.members)) return; } catch { return; }
    snapshot = packet.state;
    scene.sync(snapshot); renderRoster(); renderBubbleControl();
    el('server-name').textContent = snapshot.config.serverName;
    el('mode').textContent = snapshot.mode === 'mock' ? 'Demo office' : 'Live office';
    el('mode').classList.toggle('demo', snapshot.mode === 'mock');
    el('map-notice').hidden = snapshot.ready;
    el('map-notice').textContent = 'Connecting to Discord and fetching members…';
    el('mode-help').textContent = snapshot.mode === 'mock' ? 'You’re viewing a demo with fictional teammates. Events run every few seconds. Start the real bot to see your server.' : 'This office reflects your Discord server. Members who opt out are excluded from the map and roster.';
    el('update-time').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (packet.type !== 'snapshot' && packet.memberId && packet.bubble && localBubbles && snapshot.config.bubbleEnabled) scene.speak(packet.memberId, packet.bubble, snapshot.config.bubbleDurationMs);
  };
  socket.onclose = () => {
    el('connection').textContent = 'Reconnecting'; el('connection').classList.remove('connected');
    el('map-notice').hidden = false;
    el('map-notice').textContent = snapshot ? 'Connection lost. Showing the last known office. Reconnecting…' : 'The office is offline. Start npm run mock or npm run dev to connect.';
    scene.clearBubbles();
    setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
  };
  socket.onerror = () => socket.close();
}
connect();
