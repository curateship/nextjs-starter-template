# Monorepo Migration Plan

## Context

The current app is a multi-tenant page builder (Next.js + Supabase). The goal is to restructure it into a Turborepo monorepo so it can serve as the foundation for multiple micro-SaaS products (pomodoro, photo marketplace, etc.) and Python automation services. Each micro-SaaS has fundamentally different UIs — they're not just new blocks in the page builder.

**Key architectural decisions:**
- Hub app = page builder that also builds marketing sites for all micro-SaaS products
- Each micro-SaaS is its own Next.js app with its own admin dashboard
- Shared packages for auth, billing, UI, email, media, analytics, DB
- Python services communicate via Supabase (loosely coupled, extractable later)
- Builder engine stays in hub; extract to a package only when a 2nd app needs it

---

## Discussion Recap

### The Problem
We want to build many micro-SaaS products (pomodoro app, Airbnb for photographers, etc.) and need a scalable way to share core infrastructure without rebuilding auth, billing, and UI for each product.

### Options Considered

**1. Pure Monorepo** — All apps in one repo, shared code via packages. Each app is a separate deployment.
**2. Pure Plugin System (WordPress-style)** — One deployed app, features toggled per tenant via plugins.
**3. Hybrid (Monorepo + Plugin System)** — Monorepo for separate apps, plugin system within each app for extensibility.

### Why We Chose Monorepo (Not Plugin System)

- **Micro-SaaS products need fundamentally different UIs** — A pomodoro timer and a photo marketplace have nothing in common UI-wise. Shoehorning them into a block-based builder would be fighting the architecture.
- **Plugin systems create coupling** — One bad deploy takes down everything. A pomodoro bug shouldn't affect the page builder.
- **Next.js isn't designed for dynamic route registration** — Building a plugin system that dynamically adds routes would mean building a meta-framework on top of Next.js.
- **The builder's block system IS the plugin pattern** — Within the hub app, adding new block types and builders is already the extension mechanism. No need for a separate plugin system.

### Multi-Tenancy Decision

Not every app needs multi-tenancy:
- **Hub (page builder):** Multi-tenant, multi-site — users create and manage multiple sites.
- **Pomodoro app:** Single-tenant — each user has their own account, no "sites" concept.
- **Photo marketplace:** Multi-sided — photographers and clients, a different model entirely.

Multi-tenancy stays hub-specific. What's shared is the **auth layer** (all apps have users who sign up/login). What each app does with authenticated users is its own business.

### Admin Dashboards

Each app has its **own admin dashboard** tailored to its product. They don't share the same admin features. What they share:
- **Auth UI** (login, signup, forgot password) via `packages/auth`
- **Billing UI** (subscriptions, plans) via `packages/billing`
- **UI primitives** (sidebar layout, tables, modals) via `packages/ui`
- **AdminShell** component — shared layout wrapper, each app fills with its own navigation and content

### Page Builder Relationship

The hub (page builder) builds **marketing sites** for all micro-SaaS products:
- `pomodoro.com` → landing/marketing pages built with the hub's page builder
- `app.pomodoro.com` → the actual pomodoro product (its own Next.js app)

This is powerful — the hub becomes the "Webflow" that powers all product marketing sites. The builder engine stays in the hub and only gets extracted to a shared package if/when a second app needs an embedded builder.

### Shared vs Hub-Specific Code

| Feature | Shared Package? | Reasoning |
|---------|----------------|-----------|
| UI components (buttons, dialogs) | Yes (`@repo/ui`) | Every app needs UI |
| Auth (login, sessions, middleware) | Yes (`@repo/auth`) | Every app needs auth |
| Billing (Stripe subscriptions) | Yes (`@repo/billing`) | Every app monetizes |
| Media/Image library (R2 upload) | Yes (`@repo/media`) | Most apps need file uploads |
| Email (Resend, templates) | Yes (`@repo/email`) | Every app sends emails |
| Supabase client + types | Yes (`@repo/db`) | Every app uses the DB |
| Analytics (PostHog) | Yes (`@repo/analytics`) | Every app tracks usage |
| Page/Product/Post builders | No | Hub-specific content types |
| Block system + drag-drop | Not yet | Extract only when a 2nd app needs it |
| Themes | No | Hub-specific |
| Settings UI | Pattern only | Each app has different settings |

### Python Services

Python services (scraping, automation) live in `services/` within the same monorepo:
- Communicate with apps via **Supabase only** (no shared runtime with Node)
- Use `pyproject.toml` for Python deps, thin `package.json` for Turborepo task orchestration
- **Loosely coupled by design** — can be extracted to a separate repo later if needed
- Can share generated DB types from `packages/db/` via codegen scripts

### Package Manager: bun vs pnpm

**Decision: Use bun** (unless we hit blockers, then fall back to pnpm)
- Bun's workspace support is now mature and handles monorepos well
- Simpler than pnpm — `bun install` links everything automatically
- Also serves as runtime and script runner (replaces node/tsx for scripts)
- Workspaces defined in root `package.json` `"workspaces"` field (no separate yaml file)
- Reference local packages with `"@repo/db": "*"` — bun resolves from workspace

### Deployment: VPS with Coolify

**Not using Vercel.** Deploying to own VPS via Coolify (self-hosted PaaS).
- Coolify handles Docker builds, reverse proxy, SSL, and deployments automatically
- Each app is a separate Coolify "resource" pointing to its subdirectory
- Use `turbo prune --scope=@repo/hub` in Dockerfiles for minimal images
- Each app is independently deployable with its own domain
- Coolify can auto-deploy on git push (similar to Vercel's workflow)

### Monorepo Trade-offs Acknowledged

| Downside | Impact for us | Mitigation |
|----------|--------------|------------|
| Git gets slower | Low (small team, local only) | .gitignore discipline |
| CI/CD complexity | Medium | Turborepo + Docker + GitHub Actions |
| Dependency conflicts | Low | We control all apps |
| Blast radius of shared package changes | Low-Medium | Per-package check/format scripts |
| IDE performance | Low | Modern hardware |
| Learning curve | Medium-High | Biggest real cost |
| Python + Node awkwardness | Medium | Python loosely coupled, extractable |

---

## Target Structure

```
nextjs-starter-template-1/
├── apps/
│   ├── hub/                        ← current app (moved here)
│   │   ├── src/                    ← unchanged internal structure
│   │   ├── supabase/               ← migrations
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── [future micro-SaaS apps]
├── services/
│   └── [future Python services]
│       ├── pyproject.toml          ← Python deps (not in package.json)
│       ├── package.json            ← thin wrapper for Turborepo task orchestration
│       └── src/
├── packages/
│   ├── ui/                         ← shared shadcn components + design system
│   ├── auth/                       ← Supabase auth, middleware, session helpers
│   ├── billing/                    ← Stripe integration
│   ├── db/                         ← Supabase client factory, generated types
│   ├── email/                      ← Resend client, base templates
│   ├── media/                      ← R2 upload, image library
│   └── analytics/                  ← PostHog, Vercel analytics
├── tooling/
│   ├── tsconfig/                   ← shared TS configs (base, nextjs, library)
│   └── tailwind/                   ← shared Tailwind config + preset
├── package.json                    ← workspace root (bun workspaces)
├── turbo.json                      ← task pipeline config
└── .gitignore
```

## Migration Steps

### Phase 1: Monorepo Scaffolding (No Code Changes)

1. **Create root workspace config:**
   - Root `package.json` with `"private": true`, `"workspaces"` field, and workspace scripts
   - No `pnpm-workspace.yaml` needed — bun uses `"workspaces"` in package.json
   - `turbo.json` with build/dev/lint/test pipeline
   - Install turbo as root devDependency
2. **Move current app to `apps/hub/`:**
   - `git mv src/ apps/hub/src/`
   - `git mv public/ apps/hub/public/`
   - `git mv supabase/ apps/hub/supabase/`
   - `git mv scripts/ apps/hub/scripts/`
   - Move `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `.eslintrc.json` → `apps/hub/`
   - Move app-specific deps from root `package.json` → `apps/hub/package.json`
   - `@/*` → `./src/*` path alias is relative, should work as-is
3. **Verify hub still works:** `cd apps/hub && bun dev` — everything should work identically

### Phase 2: Extract Shared Packages (Incremental)

Do NOT extract everything at once. Start with the simplest, most reusable pieces:

**2a. `packages/ui/` — Shared Components**
- Move `src/components/ui/` → `packages/ui/src/`
- Add `package.json` with name `@repo/ui`
- Export all shadcn components
- Update hub imports: `@/components/ui/button` → `@repo/ui/button`
- Include `AdminShell` layout component for shared admin structure
- Files: `src/components/ui/*.tsx`, `src/lib/utils.ts` (cn utility)

**2b. `packages/db/` — Supabase Client**
- Extract Supabase client creation (`createClient`, `createServerClient`)
- Generated TypeScript types from Supabase
- Files: `src/lib/supabase/` → `packages/db/src/`

**2c. `packages/auth/` — Authentication**
- Extract auth actions, middleware, session helpers
- Files: `src/lib/actions/auth/`, auth-related middleware
- Depends on `@repo/db`

**2d. `packages/billing/` — Stripe**
- Extract Stripe integration
- Files: `src/lib/actions/stripe/`

**2e. `packages/email/` — Resend**
- Extract email client and base templates
- Files: `src/lib/actions/email/`

**2f. `packages/media/` — R2/Media**
- Extract R2 upload utilities, media management
- Files: `src/lib/utils/r2.ts`, `src/lib/actions/media/`

**2g. `tooling/tsconfig/` — Shared TypeScript Config**
- Base config extended by all apps and packages
- Configs: `base.json`, `nextjs.json`, `library.json`

**2h. `tooling/tailwind/` — Shared Tailwind Config**
- Shared preset with design tokens, colors, fonts
- Each app extends with app-specific customizations

### Phase 3: First Micro-SaaS App (Template)

When ready to build the first micro-SaaS (e.g., pomodoro):

1. `mkdir apps/pomodoro`
2. Init Next.js with shared configs
3. Import from shared packages:
   ```typescript
   import { Button } from '@repo/ui'
   import { createAuthClient } from '@repo/auth'
   import { StripeProvider } from '@repo/billing'
   ```
4. Build its own admin dashboard, routes, and features
5. Marketing site for `pomodoro.com` → built using the hub's page builder

### Phase 4: Python Services (When Needed)

1. `mkdir -p services/scraper`
2. Python project with `pyproject.toml` (uv or poetry for deps)
3. Thin `package.json` for Turborepo orchestration:
   ```json
   {
     "name": "@repo/scraper",
     "scripts": {
       "dev": "python -m scraper.main",
       "test": "pytest",
       "lint": "ruff check ."
     }
   }
   ```
4. Communication with apps via Supabase only (no direct imports)
5. Can share generated DB types from `packages/db/` via codegen scripts

## Key Principles

1. **Extract on second use** — Don't move code to packages until a 2nd app needs it
2. **Python stays loosely coupled** — Communicates via Supabase, no shared runtime with Node
3. **Hub owns the page builder** — Other apps don't embed the builder; hub builds their marketing sites
4. **Each app is independently deployable** — Own Docker container, own domain
5. **Shared packages are internal** — No npm publishing, just workspace references

## Hub Feature → SaaS Extraction Pattern

Hub features (events, directories, products, etc.) can become standalone SaaS products later. The process:

**Phase 1 — Feature lives in hub (now)**
Events, directories, etc. are content types within the hub. Admin UI, frontend rendering, and data layer all live in `apps/hub/`. No action needed.

**Phase 2 — Extract data layer to package (when building SaaS)**
When a feature becomes its own product, extract the **data/logic layer** (not UI) into a shared package:
```
packages/events/           ← actions, types, DB queries, validation
apps/hub/                  ← imports @repo/events, renders on marketing sites
apps/events-saas/          ← imports @repo/events, builds its OWN UI
```

Each app builds its own admin dashboard and frontend on top of the same underlying operations. The shared package is just CRUD + types + validation — never UI.

**Marketing sites** for the new SaaS (`events.com` landing page) are still built with the hub's page builder — same as any other product.

**This pattern applies to any hub feature that might fork into its own SaaS.** Build in hub first, extract the data layer when you need it in a second app. The extraction is mechanical: pull actions/types/utils into a package, update imports.

## Monorepo Tips (from research)

### Package Setup
- Each package needs clear `exports` in package.json: `"exports": { ".": "./src/index.ts" }`
- Export everything consumers need from a single `index.ts` barrel file
- Reference workspace packages as dependencies with `"@repo/db": "*"`

### Turborepo Config
- `turbo dev --ui` — nice terminal UI showing all running dev servers at once
- Dev tasks: set `"persistent": true`, no caching (they're long-running servers)
- Build tasks: enable caching for instant rebuilds when nothing changed
- `--filter` for targeted ops: `turbo check --filter=hub` checks only that app + its deps
- `turbo prune --scope=@repo/hub` — creates minimal install for Docker builds

### Per-Package Scripts
Each package should have its own scripts for targeted validation:
```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "check": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```
Root package.json can have convenience scripts:
```json
{
  "scripts": {
    "dev": "turbo dev --ui",
    "build": "turbo build",
    "check:hub": "turbo check --filter=hub",
    "check:all": "turbo check"
  }
}
```

### AI Agent Integration
- Update CLAUDE.md with list of all packages and their purposes
- Tell agents to run targeted check/format per package after changes (not whole project)
- Example: "After modifying `packages/db`, run `bun check:db`"

### Docker Deployment (VPS)
```dockerfile
FROM node:20-slim AS base
RUN npm install -g turbo bun

FROM base AS pruner
COPY . .
RUN turbo prune --scope=@repo/hub --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter=hub

FROM base AS runner
COPY --from=installer /app/apps/hub/.next/standalone ./
EXPOSE 3000
CMD ["node", "server.js"]
```

## Critical Files to Modify

- `/package.json` → becomes workspace root
- `/next.config.ts` → moves to `apps/hub/`
- `/tsconfig.json` → moves to `apps/hub/`, new root tsconfig
- `/src/` → moves to `apps/hub/src/`
- `/supabase/` → moves to `apps/hub/supabase/`
- `/public/` → moves to `apps/hub/public/`
- `/src/components/ui/` → eventually extracted to `packages/ui/`
- `/src/lib/supabase/` → eventually extracted to `packages/db/`

## Verification

1. After Phase 1: `cd apps/hub && bun dev` — hub works identically
2. After Phase 2 (each sub-step): `turbo dev --filter=hub` — hub still works with package imports
3. After Phase 3: `turbo dev --ui` — both hub and new app run in parallel
4. `turbo build` — all apps build successfully
5. Deploy via Coolify to VPS, verify production works

## Immediate Action

Save this plan to `docs/implementations/monorepo-rebuild.md` for future reference.

## What NOT to Do Yet

- Don't extract the builder engine into a package
- Don't create abstract "plugin registry" infrastructure
- Don't set up cross-app shared database schemas
- Don't pre-build admin dashboard templates for future apps
- Don't publish packages to npm — use workspace references
