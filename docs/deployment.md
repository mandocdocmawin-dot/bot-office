# Deployment & Production

## Docker

Build image (bundles server and client into single origin):

```sh
docker build -t discord-office .
docker run --rm -p 3001:10000 --env-file .env -e PORT=10000 discord-office
```

Smoke test mock container:

```sh
docker run --rm -p 3001:10000 discord-office node server/dist/index.js --mock
```

The image includes the `@office/shared` workspace during dependency installation, compilation, and runtime. Installation does not run `vp config`: that command configures local Git and editor integrations and requires development tools that are absent from the production image. Dependency lifecycle scripts remain enabled for native libraries.

## Render Blueprint

Deploy via `render.yaml`:

1. Connect repository to Render as Blueprint.
2. In Render Environment variables:
    - `DISCORD_CLIENT_ID`
    - `DISCORD_CLIENT_SECRET`
    - `DISCORD_TOKEN`
    - `GUILD_ID`
    - `WEB_URL=https://your-app.onrender.com`
    - `DISCORD_REDIRECT_URI=https://your-app.onrender.com/auth/callback`
3. Check `/health` endpoint: verify `discord.state == "connected"`.

## GIFs and Connection Diagnostics

For GIF-related disconnects, the server reports `[office] websocket_error` and unexpected `[office] websocket_closed` codes. The browser console reports its close code and whether it was clean, plus `[office] media_load_failed` when an image fails. These diagnostics exclude chat text, media URLs, and member identities. Room chat accepts a single HTTP(S) link up to 500 characters and ordinary text up to 80; oversized chat returns an error without closing the connection.

## Discord 429 Rate Limits

- Server serializes OAuth requests and enforces provider `retry_after`.
- Unrecognized 429s fallback to 60s cooldown.
- Logs report `[oauth] login_failed` with `stage`, `status`, `flow`, `clientAuth`, and UTC `retryAt`.
- Never redeploy repeatedly during 429 cooldown: does not reset Discord IP rate limit.
