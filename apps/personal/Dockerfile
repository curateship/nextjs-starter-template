# syntax=docker/dockerfile:1
#
# Live Personal. Build from the REPO ROOT, like every app here, because this
# is a pnpm workspace and the lockfile lives at the top:
#
#   docker build -f apps/personal/Dockerfile -t personal .
#
# Personal is not a shell app, so the root Dockerfile (Nitro, migrations, a
# worker) does not fit. The image is the built page and one server file.
#
# Every setting is supplied at run time, never baked in:
#   PERSONAL_PASSWORD   the one password
#   PERSONAL_ORIGIN     its own address, https://personal.barelycompany.com
#   PERSONAL_MENU_FILE  set below to the volume at /data

ARG NODE_IMAGE=node:24-alpine

# --- Build: the page and the server ---
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml local-apps.json ./
COPY apps/personal/package.json ./apps/personal/
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted --filter personal...
# Only what the build reads. Never data/ (Tyler's menu) or .env.local.
COPY apps/personal/index.html apps/personal/vite.config.ts apps/personal/app-port.ts \
  apps/personal/tsconfig.json apps/personal/tsconfig.app.json ./apps/personal/
COPY apps/personal/src ./apps/personal/src
COPY apps/personal/server ./apps/personal/server
COPY apps/personal/public ./apps/personal/public
RUN pnpm --filter personal build

# --- Run ---
FROM ${NODE_IMAGE} AS run
ENV NODE_ENV=production
ENV PORT=3000
ENV PERSONAL_MENU_FILE=/data/menu.json
WORKDIR /app
COPY --from=build /app/apps/personal/dist ./dist
COPY --from=build /app/apps/personal/dist-server/main.js ./dist-server/main.js
# The menu's volume. Owned by the user the server runs as, so a new empty
# volume starts writable.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/main.js"]
