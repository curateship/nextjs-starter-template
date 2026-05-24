# Local Environment

This document describes the current local dev server setup for the apps in this repo.

## Local URLs

- Hub: `http://localhost:3000`
- Custom Shell: `http://localhost:3002`
- Core: `http://localhost:3003`

## Why These Ports

The local apps now use a simple sequential port layout so they are easier to remember:

- `3000`
- `3002`
- `3003`

This replaces the previous mix of `3000`, `5173`, and `5174`.

## Port Configuration

The fixed ports are configured in the app-level dev setup:

- `apps/hub/package.json`
  - `next dev --turbopack --port 3000`
- `apps/custom-shell/vite.config.ts`
  - `server.port = 3002`
  - `server.strictPort = true`
- `apps/core/vite.config.ts`
  - `server.port = 3003`
  - `server.strictPort = true`

`strictPort: true` is enabled for the TanStack Start apps so they fail instead of silently moving to another port. These apps include their UI and backend in one dev server, so there is no separate Python API dev server.

## Local Helper Commands

Two local shell commands are available from `~/.local/bin`:

- `localapps`
  - prints the running local app servers and their URLs
- `restartlocalapps`
  - restarts the local app servers and prints the URLs that came back up

These commands are user-local helpers, not repo scripts.

## Current Expected Output

Running `localapps` should show:

```text
hub: http://localhost:3000
custom-shell: http://localhost:3002
core: http://localhost:3003
```
