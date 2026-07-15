FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=pomoder

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/local-apps.json ./local-apps.json
COPY --from=build /app/apps/pomoder/package.json ./apps/pomoder/package.json
COPY --from=build /app/apps/pomoder/.output ./apps/pomoder/.output
COPY --from=build /app/apps/pomoder/src ./apps/pomoder/src
COPY --from=build /app/apps/pomoder/drizzle ./apps/pomoder/drizzle
COPY --from=build /app/apps/pomoder/scripts ./apps/pomoder/scripts
COPY --from=build /app/apps/pomoder/tsconfig*.json ./apps/pomoder/
WORKDIR /app/apps/pomoder
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node scripts/healthcheck.mjs
CMD ["node", "scripts/start.mjs"]
