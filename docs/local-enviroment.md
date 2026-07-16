# Local Environment

This document describes the current local dev server setup for the apps in this repo.

## Local URLs

- Hub: `http://localhost:3000`
- Custom Shell: `http://localhost:3002`
- Core: `http://localhost:3003`
- AI Video: `http://localhost:3004`
- Antidetect: `http://localhost:3005`
- SEO: `http://localhost:3009`
- AI Agents: `http://localhost:3008`
- Trading: `http://localhost:3007`

## Why These Ports

The local apps now use a simple fixed port layout so they are easier to remember:

- `3000`
- `3002`
- `3003`
- `3004`
- `3005`
- `3007`
- `3008`
- `3009`

This replaces the previous mix of `3000`, `5173`, and `5174`.

## Port Configuration

The fixed ports are defined in `local-apps.json`.

The app-level dev setup and Personal IDE read that file:

- `apps/hub/package.json`
  - passes the Hub port to `next dev`
- `apps/custom-shell/vite.config.ts`
  - `server.port = localAppPorts["custom-shell"]`
  - `server.strictPort = true`
- `apps/core/vite.config.ts`
  - `server.port = localAppPorts.core`
  - `server.strictPort = true`
- `apps/ai-video/vite.config.ts`
  - `server.port = localAppPorts["ai-video"]`
  - `server.strictPort = true`
- `apps/anti-detect/vite.config.ts`
  - `server.port = localAppPorts["anti-detect"]`
  - `server.strictPort = true`
- `apps/seo/vite.config.ts`
  - `server.port = localAppPorts.seo`
  - `server.strictPort = true`
- `apps/ai-agents/vite.config.ts`
  - `server.port = localAppPorts["ai-agents"]`
  - `server.strictPort = true`
- `apps/trading/vite.config.ts`
  - `server.port = 3007`
- `apps/directory/vite.config.ts`
  - `server.port = localAppPorts.directory`
  - `server.strictPort = true`

`strictPort: true` is enabled for the TanStack Start apps so they fail instead of silently moving to another port. These apps include their UI and backend in one dev server, so there is no separate Python API dev server.

## Local Helper Commands

One local shell command is available from `~/.local/bin`:

- `localapps`
  - prints the running local app servers and their URLs

This command is a user-local helper, not a repo script.

## Port Registry

`local-apps.json` is the only source of app port assignments. `localapps`, Vite configs, runtime scripts, tests, and health checks must read from that registry; do not maintain a second list of port numbers in documentation or configuration.
