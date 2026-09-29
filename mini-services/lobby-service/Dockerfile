# RIFT BRAWL — lobby relay.
#
# Runs the TypeScript source directly through jiti, the same way `npm run
# lobby` does, so there is no separate build step to drift out of sync.

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm i jiti@^2.7.0 socket.io@^4

COPY mini-services ./mini-services

RUN addgroup -S rift && adduser -S rift -G rift && chown -R rift:rift /app
USER rift

EXPOSE 3003 3004
ENV PORT=3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3004/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "mini-services/lobby-service/server.mjs"]
