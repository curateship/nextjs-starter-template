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
pnpm install     # Install all workspace dependencies
pnpm run dev     # Start hub dev server (localhost:3000)
pnpm run build   # Production build
pnpm run lint    # Lint all apps
```

## Deployment

Production runs on a Hetzner VPS managed by Coolify. The root `Dockerfile` builds the directory app and runs its Nitro server output on port 3000. Directory replaced hub as the deployed app; hub remains in the repo but is no longer deployed.

`VITE_APP_URL` and `VITE_APP_DOMAIN` must be supplied as Docker build arguments — Vite freezes them into the bundle, so a rebuild is required to change them. See `apps/directory/README.md`.
