# syntax=docker/dockerfile:1
#
# One production recipe for any app built on Custom Shell.
#
# An app is two things running side by side, and this file builds both from the
# same commit:
#
#   docker build --target web    --build-arg APP=custom-shell -t custom-shell-web .
#   docker build --target worker --build-arg APP=custom-shell -t custom-shell-worker .
#
# Build from the REPO ROOT, not from the app folder — this is a pnpm workspace
# and the lockfile lives at the top.
#
# `APP` is the app's folder under apps/, which is also its name in package.json
# and therefore the pnpm filter. Nothing else in here is app-specific, which is
# the whole point: a new app copied from Custom Shell deploys by changing that
# one word.
#
# **Every value an app needs is supplied at run time, never baked in.** No
# secret is a build argument, because build arguments end up in the image's
# history where anyone who can pull the image can read them. Two apps built
# from this file share nothing: separate images, separate containers, separate
# databases, separate settings.

ARG APP=custom-shell
ARG NODE_IMAGE=node:24-alpine

# --- Common ground ---
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm
RUN apk add --no-cache libc6-compat
WORKDIR /app

# The image holds exactly one project, so pnpm's shared store and symlinked
# layout buy nothing here — that win is for the many local worktrees. Hoisted
# gives the flat node_modules the runner stages copy wholesale.
#
# This must be passed as --config.node-linker on each install: pnpm 11 moved
# settings into pnpm-workspace.yaml and ignores NPM_CONFIG_NODE_LINKER, which
# fails silently by producing a symlinked tree with no top-level tslib.

# --- Dependencies, including the build tooling ---
FROM base AS deps
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/${APP}/package.json ./apps/${APP}/
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted --filter ${APP}...

# --- Dependencies the finished images actually run on ---
# Both the Nitro server bundle and the worker bundle leave their dependencies
# as plain imports, so the runners need real node_modules — without dev tooling.
FROM base AS prod-deps
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/${APP}/package.json ./apps/${APP}/
RUN pnpm install --frozen-lockfile --prod --config.node-linker=hoisted --filter ${APP}...

# --- Build: the website ---
FROM base AS web-build
ARG APP
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml local-apps.json ./
COPY apps/${APP}/ ./apps/${APP}/
RUN pnpm --filter ${APP} build

# --- Build: the background worker ---
FROM base AS worker-build
ARG APP
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-workspace.yaml local-apps.json ./
COPY apps/${APP}/ ./apps/${APP}/
RUN pnpm --filter ${APP} build:worker

# --- The website, as it runs ---
FROM base AS web
ARG APP
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=web-build /app/package.json ./package.json
COPY --from=web-build /app/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=web-build --chown=nodeapp:nodejs /app/apps/${APP}/.output ./apps/${APP}/.output
# The database update runs on the way in, so its script and the files it
# applies have to be in the image. Nothing else from the source tree is.
COPY --from=web-build /app/apps/${APP}/scripts ./apps/${APP}/scripts
COPY --from=web-build /app/apps/${APP}/drizzle ./apps/${APP}/drizzle

# Nitro traces tslib into .output/server/node_modules but ships only tslib.es6.mjs,
# while keeping the full manifest — whose Node import condition points at
# ./modules/index.js. That truncated copy shadows the complete one in
# /app/node_modules, so any bare `tslib` import throws ERR_MODULE_NOT_FOUND at
# runtime. Overwrite it with the real package.
COPY --from=prod-deps --chown=nodeapp:nodejs /app/node_modules/tslib/ ./apps/${APP}/.output/server/node_modules/tslib/

WORKDIR /app/apps/${APP}
USER nodeapp
EXPOSE 3000

# Healthy means the server answers *and* its database does — see
# src/routes/api/health.ts for why the second half matters. Written with Node's
# own fetch because this image has no curl and does not need one.
#
# The start window is generous because the database update runs before the
# server does, and a first deploy applies every migration there has ever been
# over a network link. A container killed part-way through that is a failed
# release that looks like a mystery. Nothing is at risk while it starts: a
# container in its start window has never been healthy, so it has never taken
# traffic from the one already serving.
HEALTHCHECK --interval=15s --timeout=5s --start-period=300s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Update the database, then serve. `&&` is doing real work: a failed update
# means the server never starts, the health check never passes, and the
# replacement container never takes traffic from the one already serving.
CMD ["sh", "-c", "node scripts/migrate-database.mjs && node .output/server/index.mjs"]

# --- The background worker, as it runs ---
FROM base AS worker
ARG APP
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=worker-build /app/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=worker-build --chown=nodeapp:nodejs /app/apps/${APP}/worker/dist ./apps/${APP}/worker/dist

WORKDIR /app/apps/${APP}
USER nodeapp

# No port and nothing exposed: it serves nothing. Whether it is well is asked
# of the loop itself — the heartbeat it writes after every pass, and whether
# its database answers.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node worker/dist/health.mjs

# No database update here on purpose. The worker never changes database
# structure; the web resource has already done that and is healthy before this
# is deployed.
CMD ["node", "worker/dist/worker.mjs"]
