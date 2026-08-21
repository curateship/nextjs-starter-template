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

Four apps are live, and they are the only ones worked on:

- `apps/custom-shell` - the template every app is copied from, and a running app
  in its own right
- `apps/trade` - the trading app
- `apps/cms` - the CMS and directory app
- `apps/video` - the video app

`apps/personal-ide` is the Tauri desktop tool that creates workspaces for those
apps. Everything else under `apps/` is an older app on its way out: not worked
on, not fixed, and never merged into.

`packages/` is reserved for shared code when a real shared package is needed. `services/` currently contains `traefik-config-writer`.

## Root Commands

`pnpm run dev`, `pnpm run build` and `pnpm run lint` run through the root, and
Turbo orchestrates all three. `dev` is persistent and uncached. `build` depends
on upstream builds and stores app build outputs. Per-app shortcuts follow the
`dev:<app>` pattern and are listed in the root `package.json`.

Do not run `pnpm run dev`. A server is already running for every app, and
`docs/local-enviroment.md` explains why starting a second one takes the app away
from somebody.

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

- `unslop` - how to write anything, including every reply. Always on
- `Ui-standards` - the one UI standard for every app
- `check-yourself` - prove the last answer instead of defending it
- `plan-change` - refine requests, specifications, and implementation plans
- `implement-change` - build and test focused code changes
- `validate-app` - verify changed workflows in a running app
- `audit-change` - review changes for correctness, security, and commit readiness
- `commit-change` - create an explicitly requested local commit without pushing
- `migrate-legacy-code` - perform explicit legacy-system cutovers
- `ship-release` - prepare and execute authorized production releases
- `new-features-suggestion` and `polish-app-suggestions` - confirm opportunities
  in batches of ten

Use `.agents/skills/` for repo-local agent workflows, not app runtime code. App-specific agent instructions should live in the relevant app folder when needed.

Each app has its own `CLAUDE.md`, with an `AGENTS.md` beside it that points at
it. Both are maps and hold no rules of their own. They route agents to:

- shared skills in `.agents/skills/`, starting with `unslop`, which says how to
  write
- the shell's docs in `docs/shell/`, one copy for every app
- the app's own docs in `workspace/docs/`
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

`docs/README.md` indexes every doc in the repo. The two that decide how work is
done here are `docs/how-we-work.md`, for how a discussion goes and what counts
as evidence, and `docs/shell/shell-and-apps.md`, for what an app may and may not
edit.
