import Phaser from 'phaser'
import type { ClientPacket, Identity, Packet, Room, Snapshot } from '@office/shared/protocol'
import { colorCSS, rooms } from './rooms'
import { OfficeScene } from './scene'
import { eventBus } from './events'
import { ActivityCooldownError, activityAvatar, activityLogin, inActivity, watchActivitySpeaking } from './activity'
import { ActivitySpeaking } from './speaking'
import { KeyboardMovement, movementKey } from './keyboard-movement'
import { createActivitySignal } from './activity-signal'
import { connectActivity } from './activity-connection'
import './style.css'

const apiBase = (inActivity ? '' : import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const api = (path: string) => `${apiBase}${path}`
const app = document.querySelector<HTMLDivElement>('#app')!
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector(`#${id}`) as T
async function boot() {
    if (inActivity) {
        const next = new URL(location.href)
        next.searchParams.delete('logged_out')
        history.replaceState(null, '', next.href)
        await connectActivity(app, activityLogin, (user) => office(user, false), ActivityCooldownError)
        return
    }
    if (new URLSearchParams(location.search).has('logged_out')) {
        login()
        return
    }
    try {
        const response = await fetch(api('/api/session'), { credentials: 'include' })
        if (!response.ok) {
            throw new Error('Session unavailable')
        }
        const session = (await response.json()) as {
            user: Identity | null
            mode: string
            loginRetryAfterSeconds?: number
        }
        if (!session.user) {
            login(undefined, session.loginRetryAfterSeconds)
            return
        }
        office(session.user, session.mode === 'mock')
    } catch {
        login('The office server is unavailable. Start npm run mock or npm run dev, then try again.')
    }
}

function login(error?: string, retryAfterSeconds = 0) {
    const messages: Record<string, string> = {
        not_member: 'You must be a member of the server',
        cancelled: 'Discord sign-in was cancelled. You can try again.',
        invalid_state: 'Your sign-in link expired. Please try again.',
        failed: 'Discord sign-in failed. Check the application settings and try again.'
    }
    const code = new URLSearchParams(location.search).get('login_error') ?? ''
    app.innerHTML = `<main class="login-page"><div class="login-card"><div class="brand"><span class="brand-mark">◉</span>discord office</div><h1>Your people.<br>Your little office.</h1><p>A shared space to work, wander, and hang out with your Discord server.</p><p id="login-error" role="alert"></p><a id="discord-login" class="login-button">Continue with Discord</a><p class="login-privacy">We request only your profile and server list to verify membership. Your display name, avatar, and position appear to people in this office. Room chat disappears after five seconds and is never stored or logged. Log out any time.</p><button class="text-button" id="retry">Refresh connection</button></div><div class="login-art" aria-hidden="true"><span>⌂</span><p>One server. Under one roof.</p></div></main>`
    el('login-error').textContent = error || messages[code] || ''
    el<HTMLAnchorElement>('discord-login').href = api('/auth/login')
    if (code === 'rate_limited') {
        el('login-error').textContent = 'Discord temporarily limited sign-in requests. You can try signing in again.'
    }
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        const link = el<HTMLAnchorElement>('discord-login')
        const message = el('login-error')
        const retryAt = Date.now() + retryAfterSeconds * 1000
        message.textContent = `Discord is limiting sign-in requests. Please try again after ${new Date(retryAt).toLocaleTimeString()}.`
        link.removeAttribute('href')
        link.setAttribute('aria-disabled', 'true')
        link.textContent = 'Discord sign-in temporarily unavailable'
        const enableWhenReady = () => {
            const remaining = retryAt - Date.now()
            if (remaining > 0) {
                window.setTimeout(enableWhenReady, Math.min(remaining, 60_000))
                return
            }
            if (!link.isConnected) {
                return
            }
            link.href = api('/auth/login')
            link.removeAttribute('aria-disabled')
            link.textContent = 'Continue with Discord'
            message.textContent = 'You can try signing in again.'
        }
        enableWhenReady()
    }
    el('retry').onclick = () => location.reload()
}

function office(user: Identity, mock: boolean) {
    app.innerHTML = `
  <header class="topbar"><a class="brand" href="/" aria-label="Discord Office home"><span class="brand-mark">◉</span><span>discord<span class="brand-light">office</span></span></a><span class="header-divider"></span><span id="server-name">The Discord Office</span><div class="top-right"><span class="connection" id="connection" role="status">Connecting</span><button id="logout" class="text-button">Log out</button><button id="help" class="icon-button" aria-label="About the office">?</button></div></header>
  <div class="workspace"><main><div class="page-heading"><div><h1>A little closer together.</h1><p id="office-description">Your character. Your pace. Make yourself at home.</p></div><span class="mode demo" id="mode">${mock ? 'Demo office' : 'Live office'}</span></div><p id="discord-status" role="status" hidden></p><p id="voice-status" role="status" hidden></p>
  <div class="map-shell"><div class="map-toolbar"><div><span class="live-dot"></span><strong>Office floor</strong><span class="floor-label">Isometric view</span></div><div class="map-actions"><button id="focus-self" class="text-button">Find me</button><button id="expand" class="text-button">Expand</button><button id="fit" class="text-button">↗ Fit to view</button></div></div>
  <div id="map" role="img" aria-label="Multiplayer isometric office. Click the floor to walk; drag to pan. Use the roster to focus on a player."></div><div id="map-notice" role="status" hidden></div>
  <div class="play-dock"><button id="chat-open" aria-label="Open room chat">Chat <kbd>Enter</kbd></button><span class="emote-buttons">${['👋', '❤️', '😂', '🎉', '☕'].map((e, i) => `<button class="emote" data-index="${i}" aria-label="Emote ${i + 1}">${e}</button>`).join('')}</span><span id="room-hint">Front Office</span></div>
  <form id="chat-form" hidden><label for="chat-input">Room chat</label><input id="chat-input" autocomplete="off" placeholder="Say something or paste a GIF link…" maxlength="500"><span id="chat-count">0/80</span><button>Send</button><button id="chat-close" type="button" aria-label="Close chat">×</button></form>
  <div class="map-bottom"><span id="movement-hint">WASD / arrows to walk · Click to move · Drag to pan</span><div class="zoom-controls"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-value">100%</output><button id="zoom-in" aria-label="Zoom in">+</button></div></div></div>
  <footer class="map-footer"><span><i class="legend-dot voice"></i>Online <i class="legend-dot nap"></i>Napping · Emotes 1–5</span><span id="update-time">Connecting…</span></footer></main>
  <aside aria-label="Office room roster"><div class="roster-heading"><h2>In the office</h2><span id="total">0</span></div><p class="roster-subtitle" id="roster-subtitle">Finding your people…</p><label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Find a teammate" aria-label="Find a teammate"></label><button class="all-rooms" id="all-rooms">All rooms <span>↗</span></button><div id="roster"></div><div class="privacy-note"><span>◈</span><div><strong id="privacy-title">Only here while you are.</strong><p id="privacy-description">Only connected players appear. Room chat is transient. Log out to leave.</p><button id="bubbles" class="text-button" aria-pressed="true">Speech bubbles on</button></div></div></aside></div>
  <dialog id="help-dialog"><button id="close-help" class="icon-button" aria-label="Close help">×</button><h2>Make yourself at home.</h2><p>Walk with WASD, arrow keys, or a floor click. New Discord chat/voice activity sets a room destination; manual movement takes over whenever you choose. Moving manually cancels a pending two-minute return to Commons. Ten quiet minutes sends you to Nap Room.</p><p>General voice belongs to Commons. Other calls under CALL FOR VOICE belong to Meeting Room. A green ring and animated bars mean the member is speaking in a monitored Discord call; a voice label alone means connected, not speaking. The bot monitors one occupied voice channel at a time. No call audio is recorded, decoded or played in the map.</p><p>Drag to pan, scroll or use +/− to zoom. Fit to view resets the camera. Click a name to follow them, or use Find me. Message previews are transient. Logging out ends your viewer session, not your Discord character.</p><p>${mock ? 'This is a demo with fictional players and simulated speaking indicators. No real Discord audio is read.' : 'You signed in with Discord. Server membership is checked during login.'}</p></dialog>`
    const scene = new OfficeScene()
    if (inActivity) {
        el('logout').hidden = true
    }
    if (inActivity) {
        document.querySelector<HTMLAnchorElement>('.topbar .brand')!.onclick = (event) => {
            event.preventDefault()
            location.reload()
        }
    }
    new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'map',
        backgroundColor: '#09070f',
        scene,
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        render: { antialias: true },
        dom: {
            createContainer: true
        },
        audio: { noAudio: true }
    })
    let snapshot: Snapshot | undefined
    let serverSnapshot: Snapshot | undefined
    let selected: Room | undefined
    let query = ''
    let selfId = user.id
    let localBubbles = localStorage.getItem('office-bubbles') !== 'off'
    let socket: WebSocket
    let retry = 0
    let stopped = false
    let rosterKey = ''
    let chatVisible = false
    const keys = new KeyboardMovement(({ x, y }) => send({ type: 'input', dx: x, dy: y }))
    const activitySignal = createActivitySignal(() => send({ type: 'wake' }))
    const activitySpeaking = new ActivitySpeaking()
    let activityVoice = false
    if (inActivity && !mock) {
        void watchActivitySpeaking((id, active, channelId) => {
            if (stopped) {
                return
            }
            activitySpeaking.set(id, active, channelId)
            if (serverSnapshot && socket?.readyState === WebSocket.OPEN) {
                snapshot = { ...serverSnapshot, members: activitySpeaking.apply(serverSnapshot.members) }
                scene.sync(snapshot)
                renderRoster()
            }
        })
            .then((cleanup) => {
                activityVoice = true
                window.addEventListener(
                    'pagehide',
                    () => {
                        activitySpeaking.clear()
                        void cleanup()
                    },
                    { once: true }
                )
            })
            .catch(() => {
                activityVoice = false
            })
    }
    const discordControlled = () =>
        snapshot?.members.find((m) => m.id === selfId)?.source === 'discord' && snapshot.config.hybridControls === false
    const send = (packet: ClientPacket) => {
        if (socket?.readyState === WebSocket.OPEN && !stopped) {
            socket.send(JSON.stringify(packet))
        }
    }
    function renderRoster(force = false) {
        if (!snapshot) {
            return
        }
        const key = JSON.stringify(
            snapshot.members.map((m) => [
                m.id,
                m.username,
                m.avatar,
                m.room,
                m.sleeping,
                m.presence,
                m.inVoice,
                m.voiceChannelName,
                m.muted,
                m.speaking
            ])
        )
        if (!force && rosterKey === key) {
            return
        }
        rosterKey = key
        const roster = el('roster')
        const scroll = roster.scrollTop
        roster.replaceChildren()
        el('total').textContent = String(snapshot.members.length)
        el('roster-subtitle').textContent = `${snapshot.members.length} members across 9 rooms`
        let results = 0
        for (const room of rooms) {
            const all = snapshot.members.filter((m) => m.room === room.name)
            const members = all.filter((m) => m.username.toLocaleLowerCase().includes(query))
            if ((query && members.length === 0) || (selected && selected !== room.name)) {
                continue
            }
            const section = document.createElement('section')
            section.className = 'room-section'
            const button = document.createElement('button')
            button.className = 'room-button'
            button.style.setProperty('--room-color', colorCSS(room.color))
            button.setAttribute('aria-pressed', String(selected === room.name))
            const dot = document.createElement('i')
            dot.className = 'room-dot'
            const name = document.createElement('span')
            name.textContent = room.name
            const count = document.createElement('span')
            count.className = 'room-count'
            count.textContent = String(all.length)
            button.append(dot, name, count)
            button.onclick = () => {
                selected = selected === room.name ? undefined : room.name
                scene.select(selected)
                renderRoster(true)
            }
            section.append(button)
            if (members.length === 0) {
                const empty = document.createElement('p')
                empty.className = 'empty-room'
                empty.textContent = 'Room for a little company'
                section.append(empty)
            }
            for (const member of members) {
                results++
                const row = document.createElement('button')
                row.type = 'button'
                row.className = 'member-row'
                if (member.id === selfId) {
                    row.classList.add('is-self')
                }
                if (member.inVoice) {
                    row.classList.add('in-voice')
                }
                const avatar = document.createElement('img')
                avatar.className = 'member-avatar'
                if (member.speaking) {
                    avatar.classList.add('speaking-avatar')
                }
                avatar.alt = `${member.username}'s avatar`
                avatar.src = member.avatar || '/avatars/avatar-default.svg'
                avatar.onerror = () => {
                    avatar.src = '/avatars/avatar-default.svg'
                }
                const text = document.createElement('div')
                text.className = 'member-info'
                const top = document.createElement('div')
                top.className = 'member-topline'
                const username = document.createElement('span')
                username.className = 'member-name'
                username.textContent = member.username
                top.append(username)
                if (member.id === selfId) {
                    const you = document.createElement('span')
                    you.className = 'member-tag'
                    you.textContent = 'you'
                    top.append(you)
                }
                const state = document.createElement('div')
                state.className = 'member-state'
                if (member.speaking) {
                    state.classList.add('speaking')
                    state.innerHTML = `<span class="speaking-wave" aria-hidden="true"><span></span><span></span><span></span></span> Speaking in ${member.voiceChannelName ?? 'voice'}`
                } else if (member.inVoice) {
                    state.textContent = `${member.muted ? 'Muted' : 'Connected'} · ${member.voiceChannelName ?? 'voice'}`
                } else if (member.sleeping) {
                    state.textContent = 'Napping in office'
                } else if (member.presence && member.presence !== 'offline') {
                    state.textContent = `${member.presence} on Discord`
                } else {
                    state.textContent = 'Quiet at desk'
                }
                text.append(top, state)
                row.append(avatar, text)
                row.onclick = () => scene.focus(member.id)
                section.append(row)
            }
            roster.append(section)
        }
        if (!results && query) {
            const empty = document.createElement('p')
            empty.className = 'no-results'
            empty.textContent = 'No matching teammates.'
            roster.append(empty)
        }
        el('all-rooms').classList.toggle('filtered', Boolean(selected))
        roster.scrollTop = scroll
    }
    function bubbleControl() {
        const enabled = localBubbles && snapshot?.config.bubbleEnabled !== false
        el('bubbles').textContent = `Speech bubbles ${enabled ? 'on' : 'off'}`
        el('bubbles').setAttribute('aria-pressed', String(enabled))
    }
    function closeChat() {
        chatVisible = false
        el('chat-form').hidden = true
        el<HTMLInputElement>('chat-input').blur()
    }
    function openChat() {
        if (stopped || discordControlled()) {
            return
        }
        chatVisible = true
        keys.clear()
        send({ type: 'input', dx: 0, dy: 0 })
        send({ type: 'wake' })
        el('chat-form').hidden = false
        el<HTMLInputElement>('chat-input').focus()
    }
    el('chat-open').onclick = openChat
    el('chat-close').onclick = closeChat
    el('chat-form').onsubmit = (event) => {
        event.preventDefault()
        const input = el<HTMLInputElement>('chat-input')
        const isUrl = input.value.trim().startsWith('http://') || input.value.trim().startsWith('https://')
        const max = isUrl ? 500 : 80
        const text = [...input.value.trim()].slice(0, max).join('')
        if (text) {
            send({ type: 'chat', text })
        }
        input.value = ''
        el('chat-count').textContent = '0/80'
        closeChat()
    }
    el<HTMLInputElement>('chat-input').oninput = () => {
        const input = el<HTMLInputElement>('chat-input')
        const isUrl = input.value.trim().startsWith('http://') || input.value.trim().startsWith('https://')
        const max = isUrl ? 500 : 80
        input.value = [...input.value].slice(0, max).join('')
        el('chat-count').textContent = isUrl ? 'GIF / Link' : `${[...input.value].length}/80`
        activitySignal()
    }
    el('search').addEventListener('input', () => {
        query = el<HTMLInputElement>('search').value.trim().toLocaleLowerCase()
        renderRoster(true)
    })
    el('all-rooms').onclick = () => {
        selected = undefined
        scene.select()
        renderRoster(true)
    }
    el('fit').onclick = () => scene.fit()
    el('zoom-in').onclick = () => scene.zoom(0.2)
    el('zoom-out').onclick = () => scene.zoom(-0.2)
    el('focus-self').onclick = () => scene.focus(selfId)
    el('expand').onclick = () => {
        const full = document.querySelector('.map-shell')!.classList.toggle('expanded')
        el('expand').textContent = full ? 'Close view' : 'Expand'
    }
    el('bubbles').onclick = () => {
        localBubbles = !localBubbles
        localStorage.setItem('office-bubbles', localBubbles ? 'on' : 'off')
        if (!localBubbles) {
            scene.clearBubbles()
        }
        bubbleControl()
    }
    el('help').onclick = () => el<HTMLDialogElement>('help-dialog').showModal()
    el('close-help').onclick = () => el<HTMLDialogElement>('help-dialog').close()
    el('logout').onclick = async () => {
        const button = el<HTMLButtonElement>('logout')
        button.disabled = true
        try {
            const response = await fetch(api('/auth/logout'), {
                method: 'POST',
                credentials: 'include'
            })
            if (!response.ok) {
                throw new Error('Logout failed')
            }
            stopped = true
            keys.clear()
            socket?.close()
            const next = new URL(location.href)
            next.searchParams.set('logged_out', '1')
            location.href = next.href
        } catch {
            button.disabled = false
            el('map-notice').hidden = false
            el('map-notice').textContent = 'Could not end your session. Check the connection and try Log out again.'
        }
    }
    document.querySelectorAll<HTMLButtonElement>('.emote').forEach((button) => {
        button.onclick = () => send({ type: 'emote', index: Number(button.dataset.index) })
    })
    eventBus.onEvent('office:move', ({ x, y }) => {
        if (!chatVisible && !discordControlled()) {
            keys.clear()
            send({ type: 'move_to', x, y })
        }
    })
    eventBus.onEvent('office:zoom', ({ zoom }) => {
        el('zoom-value').textContent = `${zoom}%`
    })
    window.addEventListener('pointerdown', activitySignal)
    window.addEventListener('wheel', activitySignal, { passive: true })
    window.addEventListener('keydown', activitySignal)
    window.addEventListener('keydown', (event) => {
        const target = event.target as HTMLElement
        const typing = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
        const key = event.key.toLowerCase()
        const moveKey = movementKey(event)
        if (key === 'escape') {
            closeChat()
            document.querySelector('.map-shell')!.classList.remove('expanded')
            el('expand').textContent = 'Expand'
            return
        }
        if (typing || el<HTMLDialogElement>('help-dialog').open || event.ctrlKey || event.metaKey || event.altKey) {
            return
        }
        if (discordControlled()) {
            if (moveKey) {
                event.preventDefault()
            }
            return
        }
        if (key === 'enter') {
            event.preventDefault()
            openChat()
            return
        }
        if (moveKey) {
            event.preventDefault()
            keys.press(moveKey)
        } else if (/^[1-5]$/.test(key) && !event.repeat) {
            send({ type: 'emote', index: Number(key) - 1 })
        } else if (!event.repeat) {
            send({ type: 'wake' })
        }
    })
    window.addEventListener('keyup', (event) => {
        const key = movementKey(event)
        if (key) {
            keys.release(key)
        }
    })
    const stopMovement = () => keys.clear()
    window.addEventListener('blur', stopMovement)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopMovement()
        }
    })
    document.addEventListener('focusin', (event) => {
        const target = event.target as HTMLElement
        if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
            stopMovement()
        }
    })
    el('help').addEventListener('click', stopMovement)
    setInterval(() => keys.heartbeat(), 70)
    function connect() {
        if (stopped) {
            return
        }
        const relative = new URL(api('/ws'), location.href)
        relative.protocol = relative.protocol === 'https:' ? 'wss:' : 'ws:'
        const configured = inActivity ? undefined : import.meta.env.VITE_WS_URL
        const wsUrl = configured ? new URL(configured, relative) : relative
        if (wsUrl.protocol === 'http:') {
            wsUrl.protocol = 'ws:'
        }
        if (wsUrl.protocol === 'https:') {
            wsUrl.protocol = 'wss:'
        }
        socket = new WebSocket(wsUrl)
        socket.onopen = () => {
            retry = 0
            scene.setFrozen(false)
            el('connection').textContent = 'Connected'
            el('connection').classList.add('connected')
            el('map-notice').hidden = true
        }
        socket.onmessage = (event) => {
            let packet: Packet
            try {
                packet = JSON.parse(event.data)
            } catch {
                return
            }
            if (packet.type === 'bubble') {
                if (localBubbles && snapshot?.members.find((m) => m.id === selfId)?.room === packet.room) {
                    scene.speak(packet.memberId, packet.text, packet.duration)
                }
                return
            }
            if (packet.type === 'error') {
                const notice = el('map-notice')
                notice.textContent = packet.message
                notice.hidden = false
                setTimeout(() => {
                    if (socket.readyState === WebSocket.OPEN && notice.textContent === packet.message)
                        notice.hidden = true
                }, 5000)
                return
            }
            serverSnapshot = packet.state
            if (inActivity) {
                serverSnapshot = {
                    ...serverSnapshot,
                    members: serverSnapshot.members.map((member) => ({
                        ...member,
                        avatar: activityAvatar(member.avatar)
                    }))
                }
            }
            snapshot = { ...serverSnapshot, members: activitySpeaking.apply(serverSnapshot.members) }
            if (packet.type === 'snapshot') {
                selfId = packet.selfId
                scene.setSelf(selfId)
            }
            scene.sync(snapshot)
            renderRoster()
            bubbleControl()
            const automatic = discordControlled()
            const linked = snapshot.discord?.state === 'connected'
            el('mode').textContent = mock ? 'Demo office' : linked ? 'Discord live' : 'Live office'
            el('office-description').textContent = linked
                ? 'Walk freely. Discord activity brings you to your people.'
                : 'Your character. Your pace. Make yourself at home.'
            el('discord-status').hidden = !snapshot.discord || snapshot.discord.state === 'disabled'
            el('discord-status').textContent = snapshot.discord?.detail ?? ''
            el('discord-status').classList.toggle('linked', linked)
            el('voice-status').hidden =
                !activityVoice && (!snapshot.voiceMonitor || snapshot.voiceMonitor.state === 'disabled')
            el('voice-status').textContent = activityVoice
                ? 'Speaking indicator connected to this Discord call. Your avatar lights up while you speak.'
                : `${snapshot.voiceMonitor?.detail ?? ''}${inActivity ? ' Direct Discord speaking events unavailable; voice access may need authorization.' : ''}`
            el('voice-status').classList.toggle('linked', activityVoice || snapshot.voiceMonitor?.state === 'connected')
            el('movement-hint').textContent = automatic
                ? 'Chat in Discord to move · Drag to pan · Scroll to zoom'
                : linked
                  ? 'Hybrid · WASD / arrows / click to walk · Discord activity sets a new destination'
                  : 'WASD / arrows to walk · Click to move · Drag to pan'
            el<HTMLButtonElement>('chat-open').disabled = automatic
            document.querySelectorAll<HTMLButtonElement>('.emote').forEach((button) => {
                button.disabled = automatic
            })
            if (automatic) {
                keys.clear()
                if (chatVisible) {
                    closeChat()
                }
            }
            if (linked) {
                el('privacy-title').textContent = 'Live Discord activity'
                el('privacy-description').textContent =
                    'Members appear from Discord. Previews are transient. Log out ends your viewer session.'
            }
            el('server-name').textContent = snapshot.config.serverName
            el('room-hint').textContent = snapshot.members.find((m) => m.id === selfId)?.room ?? 'Office'
            el('update-time').textContent = mock
                ? 'Demo · move around and try the controls'
                : 'Live · 20 updates / second'
        }
        socket.onclose = (event) => {
            console.warn('[office] websocket_closed', { code: event.code, clean: event.wasClean, activity: inActivity })
            activitySpeaking.clear()
            serverSnapshot = undefined
            if (snapshot) {
                snapshot = {
                    ...snapshot,
                    members: snapshot.members.map((m) => ({ ...m, speaking: false, moving: false }))
                }
                scene.sync(snapshot)
                renderRoster(true)
            }
            scene.setFrozen(true)
            scene.clearBubbles()
            keys.clear()
            el('connection').classList.remove('connected')
            el('map-notice').hidden = false
            if ([4000, 4001, 4008, 1008].includes(event.code)) {
                stopped = true
                el('connection').textContent = 'Disconnected'
                el('map-notice').textContent =
                    event.code === 4000
                        ? 'This account opened another tab. This tab has stopped. Reload to play here.'
                        : event.code === 4001
                          ? 'Your session ended. Refresh to sign in again.'
                          : 'Connection closed: invalid or excessive input. Refresh to reconnect.'
                return
            }
            el('connection').textContent = 'Reconnecting'
            el('map-notice').textContent = 'Connection lost. Reconnecting to the office…'
            if (!stopped) {
                setTimeout(
                    async () => {
                        const response = await fetch(api('/api/session'), { credentials: 'include' }).catch(() => null)
                        if (response?.ok && !(await response.json()).user) {
                            location.reload()
                            return
                        }
                        connect()
                    },
                    Math.min(1000 * 2 ** retry++, 15_000)
                )
            }
        }
        socket.onerror = () => {
            console.warn('[office] websocket_error')
            socket.close()
        }
    }
    bubbleControl()
    connect()
}

void boot()
