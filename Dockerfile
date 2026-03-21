FROM node:20-alpine AS base

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/hub/package.json ./apps/hub/
RUN npm ci --workspace=@repo/hub

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json turbo.json ./
COPY apps/hub/ ./apps/hub/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@repo/hub

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone output preserves monorepo structure
COPY --from=builder /app/apps/hub/public ./apps/hub/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/hub/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/hub/.next/static ./apps/hub/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
