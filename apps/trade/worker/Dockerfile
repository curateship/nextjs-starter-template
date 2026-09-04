# The trading worker — the engine, as its own program.
#
# Built from the REPO ROOT, not from this folder, because it is a pnpm
# workspace and the lockfile lives at the top:
#
#   docker build -f apps/trade/worker/Dockerfile -t trade-worker .
#
# It runs the same strategy code as the website, bundled into one file. Deploy
# it as a second service beside the site, with the same database settings. Only
# one copy ever trades — a second one waits for the first to stop — so it is
# safe to start the new container before the old one goes away.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm

# --- Build ---
# Hoisted rather than pnpm's symlinked layout: this image holds one project, so
# the shared store buys nothing, and a flat node_modules is what the runner
# stage copies wholesale.
FROM base AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/trade/package.json ./apps/trade/
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted --filter trade...
COPY . .
# Coolify hands the commit it is building as SOURCE_COMMIT. Declared here so
# the build script can write it into the engine's build stamp; an undeclared
# build argument is dropped. See src/lib/build-stamp.ts.
ARG SOURCE_COMMIT
ENV SOURCE_COMMIT=$SOURCE_COMMIT
RUN pnpm --filter trade run build:worker

# --- Runtime dependencies ---
# `pg` loads native bits and is left out of the bundle, so real node_modules
# have to be there — without the build tooling.
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/trade/package.json ./apps/trade/
RUN pnpm install --frozen-lockfile --prod --config.node-linker=hoisted --filter trade...

# --- The image that runs ---
FROM base AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
# Source maps stay in the build stage for local crash debugging. The running
# image gets only the three programs Node opens, never their debugging files.
COPY --from=build /app/apps/trade/worker/dist/*.mjs ./worker/dist/
COPY --from=build /app/apps/trade/worker/dist/lighter-signer.wasm ./worker/dist/
COPY --from=build /app/apps/trade/package.json ./package.json

# No port and no health endpoint on purpose: it serves nothing. Whether it is
# alive is answered by the lock — a copy that has died is not holding one.
CMD ["node", "worker/dist/trade.mjs"]
