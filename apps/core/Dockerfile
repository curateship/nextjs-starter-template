FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/core/package.json ./apps/core/
RUN npm ci --workspace=core

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/core/node_modules ./apps/core/node_modules
COPY package.json turbo.json ./
COPY apps/core/ ./apps/core/
RUN npm run build --workspace=core

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 core

COPY --from=builder --chown=core:nodejs /app/apps/core/.output ./.output

USER core

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
