# Discord Office

Live isometric office for Discord servers and Discord Activities. Built with Phaser 3, WebSockets, and Vite+.

Characters move on Discord chat/voice events. Supports manual WASD/click hybrid control, room chat, speech bubbles, emotes, voice speaking indicators, and Discord Embedded App SDK.

---

## Quick Start

### 1. Mock Mode (Zero Credentials Needed)

Test locally with demo players and 18 automated bots:

```sh
npm install
npm run mock
```

Open **`http://localhost:5174`**.

### 2. Live Discord Mode

Run with real Discord bot gateway and OAuth authentication:

```sh
cp .env.example .env
# Fill in DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_TOKEN, GUILD_ID
npm run dev
```

Open **`http://localhost:5174`**.

---

## Controls

- **WASD / Arrows**: Walk in screen direction.
- **Click / Tap Floor**: A* pathfind through doors around walls.
- **Drag**: Pan camera. **Scroll / + / −**: Zoom (50–600%). **Fit to view**: Reset view.
- **Find me**: Center on own character. Click roster teammate to follow them.
- **Enter**: Open room chat (transient 5s, never stored).
- **1–5**: Emotes (wave, heart, laugh, celebrate, coffee).
- **Expand**: Full viewport.

---

## Project Structure

```text
packages/
  shared/
    src/
      index.ts            Shared protocol & geometry exports
      math.ts             Isometric projection & coordinates
      protocol.ts         WebSocket packet types, identity contracts
      rooms.ts            Office room bounds and geometry
server/
  src/
    index.ts            Server startup, environment, graceful exit
    app.ts              HTTP routes, OAuth, WebSocket handler
    auth.ts             OAuth2 token exchange, session cookies, resume
    discord.ts          Discord.js client, member/presence/message listeners
    discord-routing.ts  Channel alias normalization, room routing
    voice.ts            Voice speaking monitor (VoiceReceiver)
    voice-policy.ts     Occupied voice channel selector
    world.ts            Collision math, rooms, A* pathfinding
    loop.ts             Deterministic fixed-step simulation loop
    office.ts           Authoritative office simulation loop
    mock.ts             In-memory bot simulation for local dev
    config.ts           config.json schema validation
web/
  src/
    main.ts             DOM UI, WebSocket lifecycle, room chat
    scene.ts            Phaser isometric scene, character sprites, interpolation
    avatar-manager.ts   Texture caching and lifecycle cleanup
    events.ts           Decoupled client event bus
    activity.ts         Discord Embedded App SDK lifecycle & resumption
    activity-connection.ts Activity connection & error screens
    speaking.ts         Discord Activity voice speaking state manager
    isometric.ts        Coordinate transforms, furniture rendering
    rooms.ts            Visual room bounds, wall styling
    style.css           Interface styles
config.json             Office geometry and physics limits
vite.config.js          Linter and formatter configuration
```

---

## Documentation

Full operational guides are maintained in [`docs/`](./docs/):

- [Architecture & Protocol](./docs/architecture.md)
- [Discord Bot & OAuth Setup](./docs/setup.md)
- [Discord Activity Setup](./docs/activity.md)
- [Production Deployment](./docs/deployment.md)

---

## Commands

```sh
npm run dev        # Run server + Vite client concurrently
npm run mock       # Run in local demo mode with fake bots
npm run build      # Build server and web client for production
npm test           # Run Vitest test suite
npm run typecheck  # Typecheck all packages
npm exec -- vp check # Oxlint & Oxfmt check
```
