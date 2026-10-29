# Setup & Configuration

## 1. Local Mock Mode (Zero Credentials)

Runs local simulation with fictional players. No Discord account needed.

```sh
npm run mock
```

Open `http://localhost:5174`.

## 2. Live Discord Bot Setup

### Discord Developer Portal

1. Create application at [Discord Developer Portal](https://discord.com/developers/applications).
2. **OAuth2 → Redirects**: Add `http://localhost:5174/auth/callback`.
3. **Bot → Privileged Gateway Intents**: Enable:
    - `Server Members Intent`
    - `Presence Intent`
    - `Message Content Intent` (required for message previews)
4. **OAuth2 → URL Generator**:
    - Scope: `bot`
    - Permissions: `View Channels`, `Read Message History`, `Connect` (for voice monitor)
    - Open link to invite bot to your guild.

### Local Environment

Copy `.env.example` to `.env`:

```env
DISCORD_CLIENT_ID=your_app_client_id
DISCORD_CLIENT_SECRET=your_app_client_secret
DISCORD_TOKEN=your_bot_token
DISCORD_REDIRECT_URI=http://localhost:5174/auth/callback
GUILD_ID=your_discord_guild_id
SESSION_SECRET=min_32_characters_random_secret
PORT=3001
WEB_URL=http://localhost:5174
HOST=127.0.0.1
```

Run live dev:

```sh
npm run dev
```

## 3. Channel Routing (`config.json`)

Bot maps channel activity to office rooms:

- Channels under `CALL FOR VOICE` → Meeting Room.
- General voice → Commons.
- Text/forum activity moves member to room for 2 minutes, then returns to Commons.
- Inactive for 10 minutes → Nap Room.
