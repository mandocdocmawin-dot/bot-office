# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

FROM dependencies AS build
RUN --mount=type=cache,target=/root/.npm npm ci
COPY config.json ./
COPY packages/shared/src ./packages/shared/src
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY web/tsconfig.json web/vite.config.ts web/index.html ./web/
COPY web/src ./web/src
COPY web/public ./web/public
RUN npm run build

FROM dependencies AS production-dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=@office/server --workspace=@office/shared --include-workspace-root

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NODE_COMPILE_CACHE=/app/.cache \
    NODE_OPTIONS="--max-old-space-size=384" \
    HOST=0.0.0.0 \
    PORT=10000 \
    WEB_URL=https://bot-office-nwl0.onrender.com \
    DISCORD_REDIRECT_URI=https://bot-office-nwl0.onrender.com/auth/callback
WORKDIR /app
RUN mkdir -p /app/.cache && chown -R node:node /app/.cache
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json config.json ./
COPY server/package.json ./server/package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
USER node
EXPOSE 10000
CMD ["node", "server/dist/index.js"]
