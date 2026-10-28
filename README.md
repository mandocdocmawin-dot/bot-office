# Discord Office

A live, top-down office for your Discord server. Discord activity moves avatar characters between nine colored rooms. Built with TypeScript, discord.js v14, Vite, Phaser 3, and `ws`. No database.

## Try the mock office first

Install **Node.js 22.12+** and npm, then from the repository root:

```sh
npm install
npm run mock
```

Open **http://localhost:5173**. No token, server, or `.env` file is required. Twenty-four fictional members populate the office (one is initially offline and hidden); message, forum, voice, and presence events run every few seconds. The Nap Room starts occupied. Mock mode uses the same state engine and WebSocket protocol as the bot, and never reads or writes real opt-outs. Stop it with Ctrl+C before starting the real bot.

Drag to pan, scroll or use +/− to zoom, and choose **Fit to view** to reset the camera. Select a room on the map or roster to filter the sidebar; **All rooms** clears the filter. Search finds members by display name. Speech bubbles can also be disabled locally in the sidebar. The roster remains usable on a phone.

## Connect your Discord server

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and open **Bot**. Create/reset the bot token and keep it private.
2. Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Presence Intent**. Enable **Message Content Intent** if `bubble_enabled` is `true`. If you disable bubbles in `config.json`, the code omits the Message Content intent and never reads message content. Restart after changing configuration. Verified applications may need Discord approval for privileged intents; see the [official intent guide](https://discordjs.guide/legacy/popular-topics/intents).
3. In **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Grant **View Channels** for each mapped channel and the forum, plus **Read Message History** if needed for thread access. Administrator is unnecessary. Open the generated invite URL and select your server. The bot does not need to send channel messages or join voice calls.
4. In Discord, enable **User Settings → Advanced → Developer Mode**. Copy the server ID and the channel IDs, including the **parent forum ID** for `share-projects`. The bot can only observe channels and threads it can access. Private threads require access/membership; previously created threads do not generate new activity just because the bot starts.
5. Copy `.env.example` to `.env` in the repository root:

   ```env
   DISCORD_TOKEN=your_private_bot_token
   GUILD_ID=your_server_id
   PORT=3001
   WEB_URL=http://localhost:5173
   HOST=127.0.0.1
   ```

6. Replace the channel ID placeholders in root `config.json`. `_comment` fields supply channel names as valid JSON comments; JavaScript `//` comments are not supported. Keep IDs quoted. Set `main_general_voice_channel_id` to the same General voice ID used in the mappings. The category name `CALL FOR VOICE` is matched exactly, so dynamically created channels need no individual configuration.
7. Run:

   ```sh
   npm run dev
   ```

   Open **http://localhost:5173**. The bot fetches all guild members and current voice states on startup, registers `/office` in the configured guild, then announces readiness. The page shows a loading state during the fetch. It reconnects automatically if the socket drops. A new connection receives a complete snapshot.

Local Vite proxies `/ws` to port 3001. If you change `PORT`, update `web/vite.config.ts` to match, or copy `web/.env.example` to `web/.env.local` and set `VITE_WS_URL=ws://localhost:YOUR_PORT/ws`.

## Commands and privacy

Discord slash commands with subcommands cannot also be invoked bare. To support the bare `/office` link command, privacy is an optional **action choice**:

| Command | Result |
| --- | --- |
| `/office` | Replies privately with `WEB_URL` |
| `/office action:optout` | Hides you from all maps and rosters |
| `/office action:optin` | Makes you visible again |

Select `action` and then `optout` in Discord's command UI. Privacy choices are written atomically to `bot/data/optouts.json`, survive restarts, and are excluded from Git. Preserve this file when redeploying. If saving fails, the command reports failure rather than claiming success. Opt-out identities and message snippets are omitted from public event metadata as well as snapshots. The bot still maintains member activity internally so opting back in restores the current position.

Message content is never written to disk, logged, or kept in member state. When enabled, at most 40 Unicode characters are sent transiently in a live `message` event and shown for three seconds. Reconnect snapshots never replay bubbles. Every connected viewer can receive enabled snippets; turn `bubble_enabled` off to disable collection and transmission server-wide. The sidebar toggle hides bubbles for that viewer only. Avatar URLs and display names are part of the visible map.

## Rooms and movement

| Room | Activity |
| --- | --- |
| Front Office | rules, announcement, welcome, milestone, roles; new members start here for 10 seconds |
| Commons | general text, main General voice; return destination |
| Study Hall | study |
| Tech Lab | tech, github-profiles-collection |
| Game Lounge | gaming |
| Studio | clips, art |
| Showcase | share-projects forum creation and messages in its threads |
| Meeting Room | Any voice channel under `CALL FOR VOICE`, except main General voice |
| Nap Room | No activity for 10 minutes, with a Zzz indicator |

Messages and new forum posts hold a room for two minutes from the latest activity, then return the character to Commons. The `threadCreate` handler checks `newlyCreated` so joining or discovering existing threads does not count as creating a post. Thread messages resolve through their parent channel. Other text channels and voice channels use `default_room_for_unmapped_channel` (Commons by default).

**Voice takes priority:** members stay in their mapped voice room while connected, including when they send messages elsewhere. An active voice session prevents naps. Changing voice channels emits a leave and a join. Leaving voice returns to Commons and resets the idle clock. Presence changes to online/idle/dnd also reset the clock; duplicate presence events do not. Discord's `idle` presence remains distinct from the office's ten-minute Nap Room timer. Offline/invisible members are hidden by default; set `offline_behavior` to `grey` to show them dimmed. Discord does not expose invisible users as online.

Character positions are arranged in room-specific grids that compress as rooms fill. Straight-line tweens move between destinations, so characters can cross room walls during travel. At very large guild sizes, avatars necessarily become small and the roster is the readable view. Bots are included as server members.

## Configuration

All server settings live in `config.json` and are validated at startup:

| Field | Default / use |
| --- | --- |
| `server_name` | Name displayed in the page header |
| `channels` | Array of `{ "id", "room", "_comment" }` mappings |
| `main_general_voice_channel_id` | Main General voice always maps to Commons |
| `dynamic_voice_category_name` | `CALL FOR VOICE`, exact category name |
| `default_room_for_unmapped_channel` | `Commons` |
| `idle_timeout_ms` | `600000` |
| `message_stay_ms` | `120000` |
| `new_member_stay_ms` | `10000` |
| `bubble_enabled` | `true` |
| `bubble_duration_ms` | `3000` |
| `bubble_max_chars` | `40`, configurable downwards |
| `offline_behavior` | `hide` or `grey` |

Changing configuration requires a bot restart. No IDs are needed for Meeting Room or Nap Room. The web app only receives display settings, not the bot token, channel IDs, or opt-out list.

## Build, validate, and serve

```sh
npm run typecheck
npm test
npm run build
npm start
```

After a build, the bot also serves `web/dist` at **http://localhost:3001** with `/ws` on the same origin. Set `WEB_URL=http://localhost:3001` for the command link in this mode. The root `npm start` uses real Discord; to serve a production build with mock data, run `node bot/dist/index.js --mock`.

For hosting, set `HOST=0.0.0.0`, put an HTTPS reverse proxy in front of the server, forward WebSocket upgrades on `/ws`, and set `WEB_URL` to the actual HTTPS page origin. If frontend and bot are deployed separately, set `VITE_WS_URL=wss://your-bot-host/ws` **before building** the frontend. `WEB_URL` is also an allowed WebSocket origin. `/health` reports mode, readiness and visible member count; it contains no member identities.

The v1 map is a public read-only feed for anyone who can reach it; it does not implement Discord OAuth viewer authentication. Use a private network or authenticated reverse proxy if access should be limited to server members. Origins restrict browser connections but are not authentication. Incoming client messages cannot change office state. Slow clients are disconnected, and the server pings sockets to clear dead connections.

## Structure

```text
bot/
  src/
    index.ts           HTTP + WebSocket server, startup, shutdown
    protocol.ts        Shared wire types and room names
    config.ts          Configuration loading and validation
    office.ts          Deterministic activity/timing engine
    mock.ts            Fictional members and live simulation
    discord.ts         Gateway handlers and slash command
    optouts.ts         Serialized atomic local privacy persistence
    office.test.ts     Routing, timers, privacy, persistence tests
  data/optouts.json    Runtime only, ignored by Git
web/
  src/
    main.ts            Socket lifecycle, roster, search, controls
    scene.ts           Phaser rooms, furniture, avatars, walking
    rooms.ts           Floor plan and room palette
    style.css          Responsive app shell
  public/avatars/      Local fictional demo portraits
config.json
.env.example
```

The only cross-folder import is the protocol's shared types (erased at build time). Timers and room decisions live on the server. The browser renders authoritative snapshots; no database or frontend framework is needed. Official references: [Discord gateway events](https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway-events.mdx), [threads](https://github.com/discord/discord-api-docs/blob/main/developers/topics/threads.mdx), and [Phaser cameras](https://docs.phaser.io/phaser/concepts/cameras).
