# Discord Activity (Embedded App SDK)

Office runs directly inside Discord client via Embedded App SDK.

## Portal Configuration

1. Developer Portal → **Activities → Settings** → Enable Activities.
2. **Activities → URL Mappings**:
    - `/` → `<backend-host>` (e.g. `bot-office-nwl0.onrender.com`)
    - `/discord-cdn` → `cdn.discordapp.com`
3. **Installation**: Enable **Guild Install** (`applications.commands`, `bot`).
4. **OAuth2 → Redirects**: Keep browser callback URL configured.

## Architecture

- Client detects Activity mode via `*.discordsays.com` hostname and `frame_id`.
- Exchanges SDK authorization code via POST `/api/activity/token`.
- Session cookie: `office_activity_session` with `SameSite=None; Secure; Partitioned; Domain=${clientId}.discordsays.com`.
- Strict origin check: only requests from `${clientId}.discordsays.com` accepted.
- Avatars routed through `/discord-cdn/` sandbox proxy.

## Session Resumption

To avoid Discord 429 rate limits on Activity relaunch:

- Server stores OAuth access token in-memory bound to session for up to 8 hours.
- Client calls `/api/activity/resume` on launch before requesting new OAuth code.
- Restores session instantly with zero Discord API requests.
