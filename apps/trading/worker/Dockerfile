# Trading bot worker — long-running process holding Hyperliquid websockets
# and the bot engine. Built from the app root (docker build -f worker/Dockerfile .).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN node scripts/build-worker.mjs

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/worker/dist ./worker/dist
COPY --from=build /app/package.json ./package.json
# Runtime externals (pg) come from a pruned node_modules.
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "worker/dist/index.mjs"]
