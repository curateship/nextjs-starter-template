# Local Environment

This document describes the current local dev server setup for the apps in this repo.

## Local URLs

- Hub: `http://localhost:3000`
- SEO: `http://localhost:3001`
- Custom Shell: `http://localhost:3002`
- Scraper: `http://localhost:3003`
- Scraper API: `http://localhost:8001`

## Why These Ports

The local apps now use a simple sequential port layout so they are easier to remember:

- `3000`
- `3001`
- `3002`
- `3003`

This replaces the previous mix of `3000`, `5173`, and `5174`.

## Port Configuration

The fixed ports are configured in the app-level dev setup:

- `apps/hub/package.json`
  - `next dev --turbopack --port 3000`
- `apps/seo/vite.config.ts`
  - `server.port = 3001`
  - `server.strictPort = true`
- `apps/custom-shell/vite.config.ts`
  - `server.port = 3002`
  - `server.strictPort = true`

`strictPort: true` is enabled for the Vite apps so they fail instead of silently moving to another port.

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
seo: http://localhost:3001
custom-shell: http://localhost:3002
```
