# System Everything

Turborepo monorepo for the System Everything platform.

## Structure

```
apps/hub/       — Main Next.js app (multi-tenant website builder)
packages/       — Shared packages (future)
services/       — Python/other services (future)
```

## Development

```bash
npm install     # Install all workspace dependencies
npm run dev     # Start hub dev server (localhost:3000)
npm run build   # Production build
npm run lint    # Lint all apps
```

## Deployment

Production runs on a Hetzner VPS managed by Coolify. The root `Dockerfile` builds the hub app as a standalone Next.js server.
