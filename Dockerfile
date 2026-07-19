FROM node:24-alpine AS base

# --- Dependencies ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/directory/package.json ./apps/directory/
RUN npm ci --workspace=directory

# --- Production dependencies ---
# The Nitro server bundle still imports pg and isomorphic-dompurify at runtime,
# so the runner needs real node_modules — without dev tooling.
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/directory/package.json ./apps/directory/
RUN npm ci --omit=dev --workspace=directory

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json local-apps.json ./
COPY apps/directory/ ./apps/directory/

# VITE_* values are frozen into the bundle at build time, so they must be build
# args. Without VITE_APP_URL the app falls back to the local dev origin and every
# generated link (auth emails, checkout returns, tenant site URLs) points at
# localhost, so fail loudly instead of shipping that.
ARG VITE_APP_URL
ARG VITE_APP_DOMAIN
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_APP_DOMAIN=$VITE_APP_DOMAIN
RUN test -n "$VITE_APP_URL" || (echo "VITE_APP_URL build arg is required (public app origin, e.g. https://hub.example.com)" && exit 1)
RUN test -n "$VITE_APP_DOMAIN" || (echo "VITE_APP_DOMAIN build arg is required (base domain tenant subdomains hang off, e.g. example.com)" && exit 1)

RUN npm run build --workspace=directory

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeapp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/directory/package.json ./apps/directory/package.json
COPY --from=builder --chown=nodeapp:nodejs /app/apps/directory/.output ./apps/directory/.output

USER nodeapp

EXPOSE 3000
ENV PORT=3000
ENV HOST="0.0.0.0"

CMD ["node", "apps/directory/.output/server/index.mjs"]
