# Monorepo Setup

This repo is a pnpm workspace monorepo managed by Turbo. The root owns shared commands, workspace discovery, local port config, and deployment entrypoints. Each app owns its own framework setup, scripts, and runtime code.

## Root Layout

```text
apps/          App workspaces
packages/      Shared packages when needed
services/      Non-app services
docs/          Repo documentation
.agents/       Agent instructions and skills
local-apps.json
package.json
turbo.json
Dockerfile
```

## Workspaces

Root `package.json` registers:

```json
["apps/*", "packages/*", "services/*"]
```

The current apps are:

- `apps/hub` - main Hub app, package name `@repo/hub`
- `apps/custom-shell` - Custom Shell app
- `apps/core` - Core app
- `apps/ai-video` - AI Video app
- `apps/anti-detect` - Antidetect app
- `apps/ai-agents` - AI Agents app
- `apps/seo` - SEO app
- `apps/trading` - Trading app
- `apps/directory` - Directory app
- `apps/personal-ide` - desktop Personal IDE app
- `apps/directory` - Vite/TanStack port of Hub

`packages/` is reserved for shared code when a real shared package is needed. `services/` currently contains `traefik-config-writer`.

## Root Commands

Common commands run through the root:

```bash
pnpm run dev
pnpm run build
pnpm run lint
```

App-specific root shortcuts are also defined, such as:

```bash
pnpm run dev:hub
pnpm run dev:custom-shell
pnpm run dev:core
pnpm run dev:ai-video
pnpm run dev:anti-detect
pnpm run dev:ai-agents
pnpm run dev:personal-ide
pnpm run dev:directory
```

Turbo handles `dev`, `build`, and `lint` orchestration. `dev` is persistent and uncached. `build` depends on upstream builds and stores app build outputs.

## Local Ports

Local app ports live in `local-apps.json`:

The app configs, runtime scripts, tests, Personal IDE, and the `localapps` helper read from this file. Directory also derives its local origin from this registry. Change ports only there; do not duplicate assignments in code or documentation.

## Personal IDE

Personal IDE is a Tauri desktop app. It can create isolated workspaces for other apps and start their dev servers from its terminal panel.

For known local apps, Personal IDE uses `local-apps.json` for the server URL. For unknown workspaces, it falls back to ports above the configured local app range. Apps created by Personal IDE have their assigned port added to the registry automatically.

## Agent Setup

Agent-specific files live in `.agents/`.

Project skills live in:

```text
.agents/skills/<skill>/SKILL.md
```

The shared skill set is intentionally small and flat:

- `plan-change` - refine requests, specifications, and implementation plans
- `new-features-suggestion` - scan a codebase and confirm feature opportunities in batches of ten
- `polish-app-suggestions` - inspect an app and confirm polish opportunities in batches of ten
- `implement-change` - build and test focused code changes
- `validate-app` - verify changed workflows in a running app
- `audit-change` - review changes for correctness, security, and commit readiness
- `commit-change` - create an explicitly requested local commit without pushing
- `migrate-legacy-code` - perform explicit legacy-system cutovers
- `ship-release` - prepare and execute authorized production releases

Use `.agents/skills/` for repo-local agent workflows, not app runtime code. App-specific agent instructions should live in the relevant app folder when needed.

Each app has its own `AGENTS.md`. Those files route agents to:

- shared skills in `.agents/skills/`
- app docs in `workspace/docs/`
- app tasks in `workspace/tasks/`

The single UI standard lives in `.agents/skills/Ui-standards/SKILL.md`, and every app routes UI work there from its `AGENTS.md`. App-specific UX guides may describe the product without restating or weakening the shared conventions.

## Deployment

The root `Dockerfile` is one reusable recipe for any app built on Custom Shell. It has two targets — `web` and `worker` — and takes the app's folder name as a build argument:

```sh
docker build --target web    --build-arg APP=custom-shell -t custom-shell-web .
docker build --target worker --build-arg APP=custom-shell -t custom-shell-worker .
```

An app is those two things running side by side: the website, which brings the database up to date on the way in and then serves on port 3000, and a background worker, which runs automations, scheduled newsletters and the app's own registered jobs whether or not anyone is on the site. Both carry their own health checks.

Apps never share a database or any settings with each other. Production infrastructure is managed outside the app code, with Coolify running on the VPS.

The full guide — the two Coolify resources, the values they need, the release order, the health checks and rollback — is `docs/deployment.md`.

## Documentation

Useful docs:

- `docs/deployment.md` - deploying an app: the two resources, values, release order, rollback
- `docs/local-enviroment.md` - local URLs and helper command notes
- `docs/scalability.md` - scalability notes
- `docs/monorepo.md` - this overview
