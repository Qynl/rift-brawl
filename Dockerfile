# RIFT BRAWL — single image serving the static game.
#
# The game needs no server at all, so this is a builder stage plus a ~90 MB
# runtime that does nothing but hand back files. If you also want online play,
# see docker-compose.yml, which brings up the lobby relay alongside it.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first so a source-only change reuses the cached install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Blank base path: the image serves from a domain root.
ENV NEXT_PUBLIC_BASE_PATH=""
ARG NEXT_PUBLIC_LOBBY_URL=""
ENV NEXT_PUBLIC_LOBBY_URL=$NEXT_PUBLIC_LOBBY_URL
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# No dependencies to install: the server is one file of plain Node.
COPY --from=build /app/out ./out
COPY --from=build /app/tools/serve.mjs ./tools/serve.mjs

RUN addgroup -S rift && adduser -S rift -G rift && chown -R rift:rift /app
USER rift

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0 SERVE_DIR=/app/out

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "tools/serve.mjs"]
