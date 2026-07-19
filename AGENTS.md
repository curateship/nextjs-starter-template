# AGENTS.md

Root guidance for agents working in this monorepo.

This file is the orchestrator. Use it to understand the repo shape, then route to the more specific `AGENTS.md` for the app or service you are changing.

## How To Route Work

- For work in `apps/hub/`, read `apps/hub/AGENTS.md` before coding.
- For work in `apps/custom-shell/`, read `apps/custom-shell/AGENTS.md` before coding.
- For work in `apps/core/`, read `apps/core/AGENTS.md` before coding.
- For work in `apps/ai-video/`, read `apps/ai-video/AGENTS.md` before coding.
- For work in `apps/anti-detect/`, read `apps/anti-detect/AGENTS.md` before coding.
- For work in `apps/ai-agents/`, read `apps/ai-agents/AGENTS.md` before coding.
- For work in `apps/personal-ide/`, read `apps/personal-ide/AGENTS.md` before coding.
- For work in `apps/directory/`, read `apps/directory/AGENTS.md` before coding.
- For shared root files, docs, local scripts, `.agents/`, `packages/`, or `services/`, use this root file.

App-level `AGENTS.md` files override this file when they are more specific.

## Monorepo Overview

This repo is a pnpm workspace monorepo managed by Turbo.

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

Root workspaces are:

```json
["apps/*", "packages/*", "services/*"]
```

Current apps:

- Hub: `apps/hub`
- Custom Shell: `apps/custom-shell`
- Core: `apps/core`
- AI Video: `apps/ai-video`
- Antidetect: `apps/anti-detect`
- AI Agents: `apps/ai-agents`
- Personal IDE: `apps/personal-ide`
- Directory: `apps/directory`

## Root Commands

Common root commands:

```bash
pnpm run dev
pnpm run build
pnpm run lint
```

App shortcuts:

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

Only fix build, lint, or type errors caused by your change unless the user asks for broader cleanup.

## Dev Servers

**Never start a dev server (foreground or background). Always use the server already running on the app's configured port.**

## Local Ports

Local ports are defined in `local-apps.json`.

Every new app must receive one unused port in `local-apps.json` when it is created. This file is the only place an app port may be assigned. App code, runtime scripts, tests, environment defaults, Dockerfiles, health checks, and documentation must derive the port from it instead of duplicating the number. Never use another port or change an assignment unless the user explicitly requests that exact reassignment.

## Agent Files, Docs, Tasks, And Skills

Repo-local agent skills live in `.agents/skills/`.

Use `.agents/` for agent workflows and instructions. Do not put app runtime code there.

App-specific docs live in each app's `workspace/docs/` folder.

App-specific tasks live in each app's `workspace/tasks/` folder.

Every app must include `workspace/docs/ui-rules.md` and route UI work to it from its app-level `AGENTS.md`. Keep the shared UI rules identical across apps; app-specific UI documents may add stricter rules without weakening the shared conventions.

## Working Rules

- Keep changes simple and narrow.
- Fix only the requested behavior.
- Do not refactor adjacent code unless it is required for the request.
- Prefer removing code before adding code.
- Report errors directly. Do not hide failed operations.
- Before working in an app, read the app-level `AGENTS.md` and relevant app docs.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.

## Documentation

Useful repo docs:

- `docs/monorepo.md`
- `docs/local-enviroment.md`
- `docs/scalability.md`

If a change updates repo structure, local ports, root commands, or agent routing, update the relevant docs in the same change.
