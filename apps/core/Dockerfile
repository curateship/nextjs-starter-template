FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/core/package.json ./apps/core/
# node-linker=hoisted keeps the flat node_modules the builder stage copies.
# It must be a CLI flag — pnpm 11 ignores NPM_CONFIG_NODE_LINKER.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted --filter core...

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# local-apps.json is imported by apps/core/vite.config.ts and must be present
# or the config fails to load. This Dockerfile never copied it.
COPY package.json pnpm-workspace.yaml turbo.json local-apps.json ./
COPY apps/core/ ./apps/core/
RUN pnpm --filter core build

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
