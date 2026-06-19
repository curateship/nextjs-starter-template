# AGENTS.md

Root guidance for agents working in this monorepo.

This file is the orchestrator. Use it to understand the repo shape, then route to the more specific `AGENTS.md` for the app or service you are changing.

## How To Route Work

- For work in `apps/hub/`, read `apps/hub/AGENTS.md` before coding.
- For work in `apps/custom-shell/`, read `apps/custom-shell/AGENTS.md` before coding.
- For work in `apps/core/`, read `apps/core/AGENTS.md` before coding.
- For work in `apps/ai-video/`, read `apps/ai-video/AGENTS.md` before coding.
- For work in `apps/antidetect/`, read `apps/antidetect/AGENTS.md` before coding.
- For work in `apps/ai-agents/`, read `apps/ai-agents/AGENTS.md` before coding.
- For work in `apps/personal-ide/`, read `apps/personal-ide/AGENTS.md` before coding.
- For shared root files, docs, local scripts, `.agents/`, `packages/`, or `services/`, use this root file.

App-level `AGENTS.md` files override this file when they are more specific.

## Monorepo Overview

This repo is an npm workspace monorepo managed by Turbo.

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
- Antidetect: `apps/antidetect`
- AI Agents: `apps/ai-agents`
- Personal IDE: `apps/personal-ide`

## Root Commands

Common root commands:

```bash
npm run dev
npm run build
npm run lint
```

App shortcuts:

```bash
npm run dev:hub
npm run dev:custom-shell
npm run dev:core
npm run dev:ai-video
npm run dev:antidetect
npm run dev:ai-agents
npm run dev:personal-ide
```

Only fix build, lint, or type errors caused by your change unless the user asks for broader cleanup.

## Local Ports

Local ports are defined in `local-apps.json`.

Current app ports:

- Hub: `3000`
- Custom Shell: `3002`
- Core: `3003`
- AI Video: `3004`
- Antidetect: `3005`

Personal IDE and app dev configs read from `local-apps.json`. Change that file first when changing local ports.

## Agent Files, Docs, Tasks, And Skills

Repo-local agent skills live in `.agents/skills/`.

Use `.agents/` for agent workflows and instructions. Do not put app runtime code there.

App-specific docs live in each app's `workspace/docs/` folder.

App-specific tasks live in each app's `workspace/tasks/` folder.

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
