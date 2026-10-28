# Discord Office

A manual multiplayer office for your Discord server, built by extending the original Phaser + WebSocket project. Walk through the nine-room isometric office, chat with people nearby, and hang out. Discord is used only for OAuth2 login and server-membership verification. No bot, gateway connection, database, or channel mappings.

## Try it without Discord

Use Node.js **22.12+** and npm:

```sh
npm install
npm run mock
```

Open **http://localhost:5173**. Mock mode automatically creates a demo player for you and adds 18 fictional players walking through the same doors and collision geometry as human players. No credentials are required. Demo sessions and fake players exist only in memory. Stop with Ctrl+C before switching to real login mode.

## Controls

- **WASD / arrow keys:** walk in the screen direction. Diagonal movement has the same maximum speed.
- **Click / tap the floor:** walk to a destination using server-side pathfinding through doors. Walls and furniture block movement.
- **Drag:** pan the camera. **Scroll / + / −:** zoom. **Fit to view:** restore the whole map.
- **Find me:** follow your own character. Click a player's name in the sidebar to follow them. Drag or Fit to view stops following.
- **Expand:** give the office the full browser view. Escape closes it.
- **Enter / Chat button:** open room chat. Enter sends, Escape cancels. Limit: 80 Unicode characters.
- **1–5 / emoji buttons:** wave, heart, laugh, celebrate, or coffee.
- **Log out:** close your session and leave the office.

Chat and emotes appear only to connected players in the sender's room and disappear after five seconds. They are never stored or logged. New snapshots and reconnects do not replay chat. The sidebar bubble control hides previews on your device.

New players spawn in **Front Office**. After ten minutes without player input, the server teleports your character to **Nap Room** and displays Zzz. Any input wakes you; you remain there until you walk out. Discord chat, voice and presence do not move anyone.

## Set up Discord OAuth2

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). You do not need to create or invite a bot, enable gateway intents, or request message access.
2. Open **OAuth2 → Redirects** and add exactly:

   ```text
   http://localhost:5173/auth/callback
   ```

3. Copy the application's **Client ID** and **Client Secret** from its OAuth2 settings. Keep the secret on the server.
4. Enable Discord **User Settings → Advanced → Developer Mode**. Right-click your server and choose **Copy Server ID**.
5. Copy root `.env.example` to `.env` and fill in:

   ```env
   DISCORD_CLIENT_ID=your_application_id
   DISCORD_CLIENT_SECRET=your_application_secret
   DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
   GUILD_ID=your_server_id
   SESSION_SECRET=your_random_secret_at_least_32_characters
   PORT=3001
   WEB_URL=http://localhost:5173
   HOST=127.0.0.1
   ```

   Generate the session secret locally:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. Run `npm run dev` and open **http://localhost:5173**. Choose **Continue with Discord** and approve only **identify** and **guilds**. Discord redirects to the server callback through Vite's `/auth` proxy.

The server exchanges the code, checks `/users/@me/guilds` for `GUILD_ID`, and creates an in-memory session. Non-members see **You must be a member of the server**. The session is a signed opaque cookie with HttpOnly and SameSite=Lax; HTTPS deployments also set Secure. OAuth state is browser-bound, single-use and expires after five minutes, with PKCE on the code exchange. Access and refresh tokens are discarded after login. Client secrets and OAuth tokens never reach browser JavaScript.

Sessions expire after eight hours or when the server restarts. Membership is checked at login, not continuously. Logging in again invalidates previous sessions for that Discord account. Opening a second tab with the same session replaces the first tab's WebSocket; the old tab stops rather than fighting to reconnect. Normal network reconnects preserve the last position for up to 60 seconds, while the disconnected player disappears immediately from the public roster.

`.env` and `.env.local` are ignored by Git. No opt-out file is used; players appear only while connected.

Official API details: [Discord OAuth2](https://github.com/discord/discord-api-docs/blob/main/developers/topics/oauth2.mdx), [user/profile and guild APIs](https://github.com/discord/discord-api-docs/blob/main/developers/resources/user.mdx).

## Share with friends using a tunnel

Build and serve one origin so sessions and WebSockets work through the same public URL:

```sh
npm run build
npm start
```

Then choose one tunnel tool installed from its official source:

```sh
cloudflared tunnel --url http://localhost:3001
```

or:

```sh
ngrok http 3001
```

Copy the HTTPS URL printed by the tunnel, then stop the office server and update:

```env
WEB_URL=https://your-tunnel-host
DISCORD_REDIRECT_URI=https://your-tunnel-host/auth/callback
```

Add that exact callback under **OAuth2 → Redirects** in the Developer Portal, restart `npm start`, and share `WEB_URL`. Everyone must be in `GUILD_ID`. Keep the tunnel process running. When its hostname changes, update both settings and the portal redirect. Keep HOST at 127.0.0.1 for a tunnel on the same machine; use 0.0.0.0 if your hosting platform requires it. The tunnel must support WebSocket upgrades on `/ws`.

For production without a tunnel, use an HTTPS reverse proxy for the same routes. Never expose the development mock mode publicly as your real server: it deliberately skips Discord login.

## Configuration and architecture

Root `config.json` is the shared source for room names, coordinates, neon colors, door rectangles and furniture collision rectangles. The web app imports these public map settings; there are no secrets in this file. Room geometry is the original nine-room layout, projected isometrically:

Front Office, Commons, Study Hall, Tech Lab, Game Lounge, Studio, Showcase, Meeting Room, Nap Room.

Other settings:

| Setting | Default |
| --- | --- |
| `idle_timeout_ms` | 600000 |
| `player_speed` | 180 ground units/second |
| `player_radius` | 10 |
| `tick_rate` | 20 (validated range: 10–20) |
| `bubble_enabled` | true |
| `bubble_duration_ms` | 5000 |
| `bubble_max_chars` | 80 (may be lowered) |

Restart after editing config. If you change room geometry or furniture, adjust its collision rectangles too. Characters are not solid obstacles to other characters, so people can gather in narrow spaces.

The server accepts movement directions or click destinations, not client positions or time deltas. It normalizes input, expires held input after 220 ms unless refreshed, subdivides movement for collision checks, caps simulation elapsed time, and broadcasts authoritative positions at the configured tick rate. The client interpolates these positions. Room assignment follows the character's ground position. Click paths use bounded A* and the same walkable geometry as keyboard movement.

Sockets require a valid session and matching origin. Each connection has a token bucket allowing 30 packets/second with a burst of 50. Movement input is sent about 14 times/second while held. Chat/emotes are limited to one every 900 ms, and path requests to one every 350 ms. Invalid inputs, flooding and slow connections are closed. Ping/pong checks clear dead sockets. Message content never enters snapshots, saved reconnect positions, or logs.

## URLs and later Discord Activity conversion

Requests default to relative `/api/session`, `/auth/login`, `/auth/callback`, `/auth/logout`, and `/ws`. Vite proxies them to root `.env` PORT automatically. Built pages are served by the same server at port 3001. `/health` returns only readiness and mode.

Optional frontend build settings in `web/.env.local`:

```env
# Keep empty for same-origin hosting, or use a reverse-proxy prefix.
VITE_API_BASE_URL=
VITE_WS_URL=/ws
```

A full ws(s) URL is also accepted. Prefer same-origin proxying: cookies remain on one host and no CORS configuration is required. A cross-site API deployment needs additional cookie/CORS design and is not the default supported setup.

To convert to a Discord Activity later, retain the Phaser scene and simulation. Add `@discord/embedded-app-sdk` in the web client, wait for SDK readiness, obtain a Discord authorization code through the SDK, and exchange it on the server. Add a server endpoint for that entry point and retain membership/session validation. Configure Activity URL mappings for the app and `/api`, `/auth`, `/ws` routes; use mapped relative URLs. Embedded iframe cookie policies may require an Activity-specific session transport. Do not put client secrets in the SDK client or assume this standalone browser login can run unchanged inside an iframe. See [Building an Activity](https://github.com/discord/discord-api-docs/blob/main/developers/activities/building-an-activity.mdx) and [local development / URL mappings](https://github.com/discord/discord-api-docs/blob/main/developers/activities/development-guides/local-development.mdx).

## Project and checks

```text
server/                 Renamed from the original bot/ server folder
  src/
    index.ts            Environment and server startup
    app.ts              Existing HTTP/ws layer, now authenticated multiplayer
    auth.ts             OAuth2, signed in-memory sessions, logout
    protocol.ts         Shared identity, position and input types
    config.ts           Public map/simulation validation
    world.ts            Walls, doors, collision, safe spawns and pathfinding
    office.ts           Existing office state engine, now player-controlled
    mock.ts             Existing demo mode, now fake manual players
    office.test.ts      Movement, doors, timing and validation tests
    auth.test.ts        HTTP/OAuth/session and real WebSocket integration tests
web/
  src/
    main.ts             Login view, controls, room chat, roster and sockets
    scene.ts            Reused Phaser map, isometric players and interpolation
    isometric.ts        Projection and reusable desks, chairs, plants, beds
    rooms.ts            Reads shared config.json room definitions
    style.css           Existing shell plus login and multiplayer controls
  public/avatars/       Local fictional demo portraits
config.json
.env.example
```

```sh
npm run typecheck
npm test
npm run build
npm run mock
```

The integration tests run the real local HTTP/WebSocket server against an injected simulated Discord provider. They verify the authorization URL, server-side code exchange, membership rejection, session cookies, forged/replayed login rejection, logout, duplicate tabs, reconnects, room-local chat and rate limiting. No real Discord credentials are used by tests. A real Discord consent round trip requires configured credentials and a human account.

The production build includes Phaser's game engine, so Vite may report a large-chunk advisory; this is expected for the current single-bundle client.
