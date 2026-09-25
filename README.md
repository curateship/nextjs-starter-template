# System Everything

Turborepo monorepo for the System Everything platform.

## Agent Rules

- Each agent may have only one shell session open at a time. Finish or close it before opening another.

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

Production runs on a Hetzner VPS managed by Coolify. Every app built on Custom Shell deploys the same way: two Coolify resources for one app — a web resource and a background worker — both built from the root `Dockerfile` with the app's folder name as its one build argument.

Apps never share a database or any settings with each other. Outside development an app with no `CUSTOM_SHELL_DATABASE_URL` refuses to start rather than reaching for a local one.

Full instructions, the release order, the health checks and rollback: `docs/deployment.md`.
