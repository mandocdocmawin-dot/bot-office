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

## Discord 429 Rate Limits

- Server serializes OAuth requests and enforces provider `retry_after`.
- Unrecognized 429s fallback to 60s cooldown.
- Logs report `[oauth] login_failed` with `stage`, `status`, `flow`, `clientAuth`, and UTC `retryAt`.
- Never redeploy repeatedly during 429 cooldown: does not reset Discord IP rate limit.
