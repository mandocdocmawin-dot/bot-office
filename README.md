# Discord Office

A live isometric office for your Discord server, built on the existing Phaser + WebSocket project. The bot moves member characters automatically when they chat or join voice. OAuth2 restricts map viewers to server members. Hybrid controls let signed-in members walk manually while Discord activity still assigns new room destinations. Mock mode needs no credentials.

## Try it without Discord

Use Node.js **22.12+** and npm:

```sh
npm install
npm run mock
```

Open **http://localhost:5174**. Mock mode automatically creates a demo player for you and adds 18 fictional players walking through the same doors and collision geometry as human players. No credentials are required. Demo sessions and fake players exist only in memory. Stop with Ctrl+C before switching to real login mode.

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

New players spawn in **Front Office**. Hybrid mode is enabled by default: use WASD/arrows or click-to-move even while Discord is connected. New Discord chat or voice events assign a new room destination; your next manual movement takes over and cancels a pending two-minute Commons return. Browser activity renews the idle timer and wakes naps. An active Discord voice call still prevents naps even if you walk to another map room. A delayed key-up does not cancel a fresh Discord route. Set discord.hybrid_controls=false to restore automatic-only controls.

## Set up Discord OAuth2

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). OAuth2 signs viewers in; the separate Bot setup below enables automatic channel activity.
2. Open **OAuth2 → Redirects** and add exactly:

   ```text
   http://localhost:5174/auth/callback
   ```

3. Copy the application's **Client ID** and **Client Secret** from its OAuth2 settings. Keep the secret on the server.
4. Enable Discord **User Settings → Advanced → Developer Mode**. Right-click your server and choose **Copy Server ID**.
5. Copy root `.env.example` to `.env` and fill in:

   ```env
   DISCORD_CLIENT_ID=your_application_id
   DISCORD_CLIENT_SECRET=your_application_secret
   DISCORD_REDIRECT_URI=http://localhost:5174/auth/callback
   GUILD_ID=your_server_id
   SESSION_SECRET=your_random_secret_at_least_32_characters
   PORT=3001
   WEB_URL=http://localhost:5174
   HOST=127.0.0.1
   ```

   Generate the session secret locally:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. Run `npm run dev` and open **http://localhost:5174**. Choose **Continue with Discord** and approve only **identify** and **guilds**. Discord redirects to the server callback through Vite's `/auth` proxy.

The server exchanges the code, checks `/users/@me/guilds` for `GUILD_ID`, and creates an in-memory session. Non-members see **You must be a member of the server**. The session is a signed opaque cookie with HttpOnly and SameSite=Lax; HTTPS deployments also set Secure. OAuth state is browser-bound, single-use and expires after five minutes, with PKCE on the code exchange. Access and refresh tokens are discarded after login. Client secrets and OAuth tokens never reach browser JavaScript.

Sessions expire after eight hours or when the server restarts. Membership is checked at login, not continuously. Logging in again invalidates previous sessions for that Discord account. Opening a second tab with the same session replaces the first tab's WebSocket; the old tab stops rather than fighting to reconnect. Normal network reconnects preserve the last position for up to 60 seconds, while a disconnected manual player disappears from the roster. Discord-tracked characters remain independently of viewers.

`.env` and `.env.local` are ignored by Git. No opt-out file is used in this revision. Discord-tracked server members appear independently of whether they have the map open; offline members are dimmed by default. Logging out only ends the viewer session.

Official API details: [Discord OAuth2](https://github.com/discord/discord-api-docs/blob/main/developers/topics/oauth2.mdx), [user/profile and guild APIs](https://github.com/discord/discord-api-docs/blob/main/developers/resources/user.mdx).


## Automatic Discord activity (bot setup)

The bot token is different from the OAuth Client Secret. In Developer Portal → your application → **Bot**, enable **Server Members Intent**, **Presence Intent**, and **Message Content Intent**. Put the Bot token in private root `.env`:

```env
DISCORD_TOKEN=your_bot_token
```

Invite that application to the server selected by GUILD_ID using OAuth2 URL Generator, scope **bot**, with **View Channels** and **Read Message History**. Administrator is unnecessary. The speaking indicator additionally requires **Connect** permission for the monitored voice channel. The bot never sends messages into Discord. Give it View Channel access in every room/channel you want to observe, including the forum. After changing .env or intents, stop the current dev process before restarting npm run dev; do not start another copy on the same ports.

The status banner in the office reports missing token, connecting, connected, or setup failure. /health also includes this status without credentials. OAuth login remains required for viewers even though all human guild members can appear as characters. Bots/webhooks are excluded.

The default `config.json` → `discord.channels` aliases work with decorated channel names such as 💬┃GENERAL. Discord names are normalized to match general, study, tech, github-profiles-collection, gaming, clips, art, rules, announcement(s), welcome, milestone, roles and share-projects. For reliable routing after renames, set an explicit channel `id`; duplicate an entry if multiple IDs belong to the same room. Explicit IDs take precedence. Threads use their parent forum/channel even if their title happens to be another mapped room name. Unmapped channels fall back to Commons.

Main General voice maps to Commons. Any other voice channel under CALL FOR VOICE maps to Meeting Room. Set main_general_voice_channel_id explicitly if multiple voice channels are named General. New members spend ten seconds in Front Office. Text/forum activity sends members through the existing doors to the mapped room, holds it for two minutes, then returns to Commons. Voice takes priority over messages and prevents naps until the member disconnects. Ten minutes without Discord activity sends them to Nap Room; Discord activity wakes them. Presence changes wake sleeping characters; repeated identical presence updates do not reset the clock.

Discord message previews are capped at 40 Unicode characters and sent transiently to current room occupants. They are never written to files, retained in member state, logged or replayed to reconnects. Set `discord.message_previews=false` to prevent content collection/transmission and omit Message Content intent. Set `discord.offline_behavior=hide` to hide offline/invisible members, or `grey` to dim them. The default is grey, so users with Invisible status can still locate their character. Local bubble controls only hide previews for that viewer.

Set `discord.enabled=false` and restart to return to purely manual multiplayer. `npm run mock` always stays offline and never logs the bot in.


## Visual speaking indicator and walking animation

Set `discord.speaking_indicator=true` (default) for a green ring, animated speaking bars, and sidebar Speaking state. Merely joining voice shows **In voice** or **Muted**; it does not fake speaking. General voice maps to Commons, including decorated small-cap names such as ɢᴇɴᴇʀᴀʟ. Voice membership remains independent of where you walk manually in the map.

The bot joins one occupied voice channel at a time, self-muted and with self-deafening off so it can detect packet activity. It stays in an occupied channel, otherwise prefers main General voice and then the busiest occupied call. An explicit `discord.speaking_channel_id` selects a single channel instead. Discord permits one simultaneous voice channel per bot account per guild; other calls still have normal room movement and voice labels, but no real speaking signal while unmonitored. The status banner names the monitored call. The bot leaves when no human participants remain. Set speaking_indicator=false and restart to disable voice monitoring.

The receiver uses its SpeakingMap only; the app creates **no audio stream subscriptions**, decoders, audio players, recordings, transcriptions, or browser audio tracks. Incoming encrypted packets are used for speaking activity and their audio payload is not decoded, persisted, or relayed. The voice receiver API is a library beta, so the banner reports connection failures rather than simulating a live speaker. /health exposes a coarse speaking-event count for connectivity diagnostics, without participant identities or audio.

To test live speech, actually join the Discord voice call, unmute, and speak while the bot is present. Muting, leaving, loss of monitoring, or missing events clears the indicator. No browser microphone permission is needed. In mock mode Alex and Jun simulate speaking without any microphone or Discord connection.

Characters have separately animated feet and arms while walking, with alternating steps driven by the distance travelled on screen. The stride resets when stopped; reduced-motion preference uses smaller steps without body bounce or sway. Your own character is fully opaque in your local view even with Discord Invisible/offline presence; other offline members keep the configured dimming.

Voice implementation references: [VoiceConnection receiver](https://discord.js.org/docs/packages/voice/main/VoiceConnection%3AClass), [VoiceReceiver packet handling](https://github.com/discordjs/discord.js/blob/main/packages/voice/src/receive/VoiceReceiver.ts).

## Camera zoom

Mouse wheel/trackpad zoom is captured only over the canvas and stays anchored under the cursor. +/− buttons zoom around the camera center; range is 50–600%. Expand/window resize preserves the selected zoom. Only **Fit to view** resets it to 100%. Drag pans the zoomed view.

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

## Deploy to Render with Docker

The root `Dockerfile` builds both workspaces and runs the Node server with the built frontend on the same origin. It uses Node 24, production server dependencies, a non-root runtime user, and direct Node startup for shutdown signals. `.dockerignore` allows only build inputs, keeping local `.env` files, Git history, dependencies, and QA artifacts out of the build context.

1. Push this repository, including `Dockerfile`, `.dockerignore`, `render.yaml`, and `package-lock.json`, to your Git provider. Keep your local `.env` private.
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml` to create one Docker web service in Singapore, with a paid 512 MB compute plan, one instance, and `/health` checks. Review the displayed cost before creating it.
3. Enter the requested `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_TOKEN`, and `GUILD_ID` values. Render generates `SESSION_SECRET` automatically.
4. The Docker image and Blueprint now default to `WEB_URL=https://bot-office-nwl0.onrender.com` and `DISCORD_REDIRECT_URI=https://bot-office-nwl0.onrender.com/auth/callback`. For an existing manually created Render service, set these same values under **Environment** and redeploy: existing environment variables override the image defaults. If you change the public hostname, update both values.
5. Add the exact `DISCORD_REDIRECT_URI` under **Discord Developer Portal → OAuth2 → Redirects**. Keep the bot intents and permissions from the setup sections above enabled.
6. After deployment, open `/health` to check HTTP readiness and inspect its `discord` and `voiceMonitor` states separately. Sign in through Discord, test walking with another member, and join a voice call to verify the speaking indicator. Voice monitoring also requires a working outbound Discord voice/UDP connection from the host.

For manual service creation instead of a Blueprint, choose **Web Service → Docker**, leave the root directory at the repository root, set Dockerfile Path to `./Dockerfile`, and leave Docker Command empty to use the image's default command. Use `/health` as the health check and add the same environment variables. Generate a random `SESSION_SECRET` of at least 32 characters yourself for this path. The image defaults to `HOST=0.0.0.0` and `PORT=10000`, and also respects a platform-provided `PORT`.

Keep one instance: office state and sessions currently live in memory, and each process starts a Discord bot connection. Restarts and redeploys reset sessions and positions; a persistent disk alone does not change that. Paid compute avoids the free tier's idle spin-down. There is no database or disk required for this version.

Reference: [Render Docker deployment](https://render.com/docs/docker) and [Blueprint configuration](https://render.com/docs/blueprint-spec).

To build and try the same image locally with Docker Desktop running:

```sh
docker build -t discord-office .
docker run --rm --init -p 3001:10000 --env-file .env -e HOST=0.0.0.0 -e PORT=10000 -e WEB_URL=http://localhost:3001 -e DISCORD_REDIRECT_URI=http://localhost:3001/auth/callback discord-office
```

Add `http://localhost:3001/auth/callback` as a Discord OAuth2 redirect for that local test. To smoke-test the image without Discord credentials, use mock mode on loopback only:

```sh
docker run --rm --init -p 127.0.0.1:3001:10000 -e WEB_URL=http://localhost:3001 discord-office node server/dist/index.js --mock
```

Open `http://localhost:3001` and `http://localhost:3001/health`. Do not use the mock command on Render.

## Discord login rate limits on Render

If Discord returns HTTP 429 during token exchange, profile lookup, or server membership lookup, the office pauses new login attempts for the provider's `Retry-After` / `retry_after` duration. HTTP-date headers and fractional seconds are supported. When Discord omits usable retry information, the office uses a conservative 60-second cooldown. It does not repeatedly exchange the same authorization code or automatically retry sign-in; start a fresh login after the cooldown.

Provider requests are dispatched one at a time, with a cooldown check immediately before each request. This also stops callbacks that were already in progress or waiting when another request received 429. Token exchange uses Discord's documented HTTP Basic client authentication; this is supported authentication, not a guarantee against provider rate limits. A browser with a valid session returns directly to the office when it visits `/auth/login`, avoiding another code exchange.

The login page shows when to try again and disables the sign-in link until then. Refreshing the page reads the remaining cooldown from the server. Existing office sessions keep working. The cooldown is shared by login attempts on this one server instance and resets if the process restarts; don't redeploy repeatedly to retry a blocked request.

In **Render → service → Logs**, look for `[oauth] login_failed`. Rate-limit diagnostics include the failing stage, HTTP status, `retryAfterSeconds`, `retrySource` (`discord` or `fallback`), `retryAt` (UTC), `responseType`, and a provider scope or numeric error code if supplied. Raw provider bodies, credentials, tokens, callback codes, and cookies are never logged.

This handling respects the provider's limit; it cannot remove an external IP restriction. If fresh logins still receive 429 after the reported cooldown, provide these sanitized diagnostics to Render/Discord support to investigate the host's outbound IP. The log alone does not prove a shared-IP issue. Render idle startup delays are separate from Discord OAuth rate limits. See [Discord's rate-limit documentation](https://docs.discord.com/developers/topics/rate-limits).

### Repeated 429 or bot server-access errors: deployment checklist

1. Wait until the latest `retryAt` before starting one fresh sign-in. For example, `2026-10-29T04:56:13.243Z` is **October 29, 12:56:13 PM in the Philippines/Singapore**. `retryAfterSeconds: 1473` means 24 minutes 33 seconds. Refreshing, resetting credentials, and redeploying do not clear Discord's restriction. A numeric `providerCode: 0` alone does not identify its cause.
2. In **Render → Environment**, verify `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` belong to the same Discord application. `DISCORD_TOKEN` must be its **Bot token**, not the client secret. Keep these secrets private; don't paste them into logs or support tickets.
3. Verify `GUILD_ID` is the intended **server ID** (Discord Developer Mode → right-click the server → Copy Server ID). In that application's **OAuth2 → URL Generator**, select **bot**, grant **View Channels** and **Read Message History** (plus **Connect** for the speaking monitor), then open the generated link and add the bot to this exact server. A user successfully signing into the website does not install the bot.
4. In **Developer Portal → Bot → Privileged Gateway Intents**, enable **Server Members Intent** and **Presence Intent**. Enable **Message Content Intent** if `config.json` enables message previews. This fixes gateway access; it does not clear an OAuth token-exchange 429.
5. Set `WEB_URL=https://bot-office-nwl0.onrender.com` and `DISCORD_REDIRECT_URI=https://bot-office-nwl0.onrender.com/auth/callback`. Add the identical callback in **Developer Portal → OAuth2 → Redirects**. After correcting configuration, deploy the updated code once and wait out any remaining provider cooldown. Keep one service instance; additional copies have independent in-memory cooldowns.
6. Open `/health` and confirm `discord.state` is `connected`. HTTP 200 / `ready: true` confirms the web process is running even when the bot is disconnected. Try one fresh website login after the cooldown. These are separate checks: bot connection and user OAuth login must both work.
7. If that login gets another token-exchange 429, collect its sanitized `[oauth] login_failed` line and the service's outbound ranges from **Render → service → Connect → Outbound**, then contact Render/Discord support. Render documents that regional outbound ranges are shared, but these logs cannot prove another tenant caused this restriction. Investigate before changing hosting or paying for dedicated outbound IPs. Reference: [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses).

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

## Launch inside Discord as an Activity

The office detects a Discord Activity launch and connects automatically through the official Embedded App SDK inside Discord. It never displays the browser login page or a Join/Login button inside an Activity. Provider cooldowns show a waiting screen with a countdown and reconnect automatically after the server's deadline; other failures show a connection retry action. The server exchanges the SDK code and checks the profile and configured server membership before creating an office session. Normal browser and mock mode remain available for local debugging.

1. Deploy this updated code to your Render service. In Render Environment use the same current `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_TOKEN` and `GUILD_ID` that work locally. Local `.env` changes are not copied to Render. Keep the production `WEB_URL` and `DISCORD_REDIRECT_URI` values from `render.yaml`.
2. Open your application in [Discord Developer Portal](https://discord.com/developers/applications). Under **Activities → Settings**, turn on **Enable Activities**. Discord automatically creates the default **Launch** Entry Point command; keep its default Discord handler.
3. Under **Activities → URL Mappings**, add these mappings (targets are hostnames, without `https://`):

   | Prefix | Target |
   | --- | --- |
   | `/` | `bot-office-nwl0.onrender.com` |
   | `/discord-cdn` | `cdn.discordapp.com` |

   The root mapping serves the page, `/api`, `/auth` and `/ws` from the same backend. The second mapping serves Discord avatars through the sandbox proxy. Use your actual Render hostname if different.
4. Keep the browser callback URL under **OAuth2 → Redirects**. Activity code exchange uses the SDK flow and does not send the standalone browser redirect URI or PKCE verifier.
5. Under **Installation**, enable **Guild Install** and include `applications.commands` along with `bot` in the installation scopes. Install the app in your configured server. Keep the bot intents and permissions described above enabled.
6. Enable **Discord User Settings → Advanced → Developer Mode**. From your server's App Launcher / **Start an Activity**, find your application and choose **Launch**. During development, launch access is limited to the application owner/developer team. Wider availability requires Discord's distribution setup.

No extra `VITE_` client ID is required: `/api/activity/config` supplies only the public application ID and login cooldown. Activity API and WebSocket URLs always use the Discord proxy origin, even if browser-specific `VITE_API_BASE_URL` or `VITE_WS_URL` overrides exist.

Activity sessions use a separate signed HttpOnly cookie with `SameSite=None; Secure; Partitioned` and the application's exact `clientId.discordsays.com` domain. Only that application's proxy origin can submit Activity token exchanges. Server membership is checked with Discord's API, not client-supplied user or guild IDs. Inside Discord, close the Activity to leave; the browser-only Log out control is hidden. Sessions expire after eight hours or a server restart.

Unlike standalone browser login, Activity login sends the OAuth access token to the SDK's `authenticate` command in browser memory. To avoid exchanging a new code on every Activity relaunch, its signed session also retains the access token only in server memory until the earlier of token expiry (minus a 60-second margin) or eight hours. `/api/activity/resume` requires the exact app proxy origin and a valid Activity cookie, and returns only that session's identity/token for SDK authentication. It makes no Discord API requests and works during a provider cooldown. Logout, session invalidation and server restarts discard it; missing or expired sessions require normal SDK authorization. Tokens are never put on disk, in localStorage, URLs, logs or office snapshots. Client secrets and bot tokens stay on the server. Activity and browser login share the same provider cooldown; switching to Activity does not bypass a Discord rate limit.

When reporting a repeated 429 after deploying this version, include the sanitized `[oauth] login_failed` entry with `flow`, `clientAuth`, `stage`, `retrySource` and `retryAt`. A new user's token exchange may still be restricted by Discord even when session resumption works. The existing log `stage=token_exchange, status=429, retrySource=discord, providerCode=0` confirms a provider cooldown but does not identify which tenant or request pattern caused it. Do not rotate IPs, shorten provider cooldowns or redeploy repeatedly to evade it; use Render/Discord support to investigate persistent restrictions.

For local Activity development, map `/` to an HTTPS tunnel serving the built app on port 3001, or Vite on port 5174. Vite's `allowedHosts` must include your current tunnel hostname (without `https://`). Keep the tunnel running. See [Discord's Activity setup guide](https://docs.discord.com/developers/activities/building-an-activity) and [proxy/cookie requirements](https://docs.discord.com/developers/activities/development-guides/networking).

## Project and checks

```text
server/                 Renamed from the original bot/ server folder
  src/
    index.ts            Environment and server startup
    app.ts              Existing HTTP/ws layer, now authenticated multiplayer
    auth.ts             OAuth2, signed in-memory sessions, logout
    discord.ts          Gateway connector and live member/voice/message events
    discord-routing.ts  Decorated channel aliases, IDs and forum/voice routing
    discord.test.ts     Automatic routing, timers, previews and voice tests
    voice.ts            Single-call speaking monitor; no audio subscriptions
    voice-policy.ts     Stable occupied-channel selection
    hybrid.test.ts      Hybrid takeover, mute/speaking and monitor-policy tests
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
