# Local Environment

This document describes the current local dev server setup for the apps in this repo.

## Local URLs

- Hub: `http://localhost:3000`
- Custom Shell: `http://localhost:3002`
- Core: `http://localhost:3003`
- AI Video: `http://localhost:3004`
- Antidetect: `http://localhost:3005`

## Why These Ports

The local apps now use a simple fixed port layout so they are easier to remember:

- `3000`
- `3002`
- `3003`
- `3004`
- `3005`

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

`strictPort: true` is enabled for the TanStack Start apps so they fail instead of silently moving to another port. These apps include their UI and backend in one dev server, so there is no separate Python API dev server.

## Local Helper Commands

One local shell command is available from `~/.local/bin`:

- `localapps`
  - prints the running local app servers and their URLs

This command is a user-local helper, not a repo script.

## Current Expected Output

Running `localapps` should show:

```text
hub: http://localhost:3000
custom-shell: http://localhost:3002
core: http://localhost:3003
ai-video: http://localhost:3004
anti-detect: http://localhost:3005
```
