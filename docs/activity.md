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
- GIF bubbles use the authenticated, same-origin `/api/media/image` route under the existing `/` URL mapping. The Activity never loads GIF provider URLs directly. Giphy links resolve from their public GIF id; Tenor/Klipy pages use image metadata. Only supported provider hosts and raster image types are accepted, redirects are checked, and downloads are bounded to 8 MiB with four distinct concurrent downloads. Viewers of the same GIF share its in-flight download. A loaded GIF stays visible for the full configured bubble duration.
- Chat typing shares the throttled activity signal with keyboard/pointer events, so typing a GIF link does not flood the WebSocket.

## Session Resumption

To avoid Discord 429 rate limits on Activity relaunch:

- Server stores OAuth access token in-memory bound to session for up to 8 hours.
- Client calls `/api/activity/resume` on launch before requesting new OAuth code.
- Restores session instantly with zero Discord API requests.
