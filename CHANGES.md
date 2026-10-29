# Manual multiplayer revision

## Deleted

- `bot/src/discord.ts`: Discord client, gateway intents, channel events and slash commands.
- `bot/src/optouts.ts`: local opt-out persistence. Runtime `optouts.json` and temporary file are no longer read or created; any existing files were removed during migration.
- The old bot-driven test cases in `bot/src/office.test.ts`, replaced with manual simulation tests.
- `discord.js` and its now-unused dependencies from the manifests/lockfile.

## Renamed and changed

The existing `bot/` server directory is now `server/`. This preserves the two-workspace architecture with `web/`.

- `server/package.json`, `server/tsconfig.json`: reused workspace/build setup, renamed package and expanded test script.
- `server/src/index.ts`: OAuth environment validation and startup, no bot token or Discord gateway.
- `server/src/office.ts`: reused in-memory office model, now authoritative movement, nap timing, transient bubbles and emotes.
- `server/src/config.ts`: room geometry and simulation validation instead of channel mapping.
- `server/src/protocol.ts`: identities, ground positions, movement input and transient room chat.
- `server/src/mock.ts`: existing demo launcher, now simulated manual movement through the real collision model.
- `server/src/office.test.ts`: movement speed, wall/door paths, idle handling, privacy and input validation tests.
- `config.json`: preserves nine room names/coordinates/colors; adds doors, obstacles and simulation settings; removes channel IDs.
- `package.json`, `package-lock.json`: new workspace path and removed bot dependency.
- `.env.example`: OAuth client ID/secret/redirect URI, guild ID, session secret, port, web URL and host.
- `.gitignore`: keeps `.env` and `.env.local` ignored and updates runtime directory path.
- `web/src/main.ts`: existing app shell, sidebar, search, camera controls and reconnect behavior; adds login/logout, keyboard/click movement, chat, emotes and player focus.
- `web/src/scene.ts`: reused Phaser scene and reference-inspired isometric map; now interpolates authoritative coordinates, renders doors, and preserves Discord avatar faces on game characters.
- `web/src/rooms.ts`: shared room definitions imported from root config.
- `web/src/style.css`: preserves the existing shell; adds login, chat dock and expanded map view.
- `web/tsconfig.json`, `web/vite.config.ts`, `web/.env.example`: JSON map import, relative API/auth/socket proxying and configurable URLs.
- `README.md`, `DESIGN.md`: new authentication, hosting, privacy, controls and visual-system documentation.

## Added

- `server/src/app.ts`: authenticated HTTP/ws layer extracted from the existing entry point, duplicate-tab replacement, input validation and rate limits.
- `server/src/auth.ts`: Authorization Code + PKCE, single-use state, membership check, signed HttpOnly cookies, in-memory sessions and logout.
- `server/src/world.ts`: collision geometry, safe spawns, speed-safe movement and bounded pathfinding.
- `server/src/auth.test.ts`: local HTTP/OAuth and actual WebSocket integration tests with a simulated Discord API.
- `web/src/isometric.ts`: reference-inspired projection and reusable miniature office furnishings from the preceding visual revision.
- `CHANGES.md`: this migration inventory.

## Verification

The test suite validates OAuth callbacks with an injected provider, non-member rejection, session creation and logout, forged/replayed login rejection, duplicate tabs, reconnects, same-room chat and rate limiting. Browser checks cover the running `npm run mock` app, click-to-move from Front Office into Commons, Enter/chat bubbles, camera controls and the login/logout screens.

Real Discord consent is a separate live check: it needs valid application credentials, a matching Developer Portal redirect and an account in the configured guild. No such credentials are bundled or faked as a real Discord login.

## Subsequent revision: automatic Discord activity and zoom repair

Added `server/src/discord.ts`, `server/src/discord-routing.ts`, and `server/src/discord.test.ts` to restore live message, forum, voice, member and presence updates. Existing OAuth login still restricts viewers to the configured guild. Tracked members remain when viewers disconnect, ignore browser movement, and follow Discord activity and idle timers instead. Message snippets are capped at 40 characters and remain transient. The bot never posts into Discord.

Updated `server/src/office.ts`, `protocol.ts`, `config.ts`, `auth.ts`, `app.ts`, `index.ts`, `config.json`, the server package/lockfile, `.env.example`, and README. Restored `discord.js` as a server dependency and added private `DISCORD_TOKEN` configuration. Token validity and guild membership are checked separately; missing invitation or intents are shown in the office status banner.

Updated `web/src/main.ts` and `style.css` for live Discord status, automatic-control hints, offline dimming, and accurate privacy wording. Updated `web/src/scene.ts` to preserve zoom on resize/Expand, capture wheel/trackpad scrolling over the canvas without scrolling the page, zoom toward the pointer, and support 50–600% magnification. Fit to view is the explicit reset. Browser checks verified +/−, wheel input and zoom preservation across Expand. Server checks cover six additional Discord activity scenarios (19 total tests).

## Hybrid controls, speaking indicators and articulated walking

Added server/src/voice.ts, voice-policy.ts, hybrid.test.ts and @discordjs/voice. Updated the office model/protocol/config, Discord adapter and existing tests for manual takeover, voice labels, mute/speaking state, safe expiry and one-call monitoring. The live bot joins the selected call without audio stream subscriptions or browser audio. Updated the frontend for hybrid controls, speaking rings/bars, full-opacity self characters, and separately animated legs/arms. Small-cap channel names normalize correctly. Switched the server dev/mock scripts to the verified Node watcher after tsx watch stalled with the new dependency. Existing OAuth, collision, zoom and room geometry remain.
