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

**After any browser-facing change, run `.agents/skills/validate-app` before reporting the work as done.** Load the page in a real browser and check the console, not just the HTTP status. A build that succeeds, a passing type check and a `curl` returning 200 all say nothing about whether the page crashes once its JavaScript runs — a server-rendered page can return 200 while hydration throws. Use the browser controller or `playwright` (already installed at the repo root). This does not require starting anything: point it at the server already running on the app's port, or at the deployed URL.

App-specific docs live in each app's `workspace/docs/` folder.

App-specific tasks live in each app's `workspace/tasks/` folder.

The single UI standard lives in `.agents/skills/Ui-standards/SKILL.md`. Every app routes UI work to that skill from its app-level `AGENTS.md`; do not create app-local copies that can drift. An app-specific UX document may describe its product without restating or weakening the shared conventions.

## Working Rules

- Keep changes simple and narrow.
- Fix only the requested behavior.
- Do not refactor adjacent code unless it is required for the request.
- Prefer removing code before adding code.
- Report errors directly. Do not hide failed operations.
- Before working in an app, read the app-level `AGENTS.md` and relevant app docs.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.

## How To Write Replies

This applies to every reply and every summary of finished work. Tyler is smart
but is not a programmer. Write the way you would explain something to a friend
over coffee.

- **Lead with the answer.** First sentence says what is true, then explain.
- **Bullet points, not blocks of text.** After the opening line, put everything
  else in a short bullet list. A paragraph of four or more lines is a wall of
  text and is not allowed.
- **One idea per bullet, one or two short sentences.** If a bullet needs a third
  sentence, it was two bullets.
- **Break long sentences up.** More than one comma, or you had to read it twice?
  Split it into two sentences.
- **Never stack headings on tables on bullet lists.** Pick one shape and stay in
  it. At most one table per reply.
- **Plain English, no tech speak.** No jargon like "no-op", "inert", "dead
  code", "naive", "delta", "gradient", "gate", "arm", "trigger" as a noun. Say
  "it doesn't do anything", "the difference", "the rule that blocks it".
- **Explain any unavoidable term the first time, in the same sentence**, in
  everyday words.
- **Use dollars, not percentages of percentages.** Say numbers out of 100, not
  as rates: "45 out of 100 made money" beats "a 45% win rate".

**The test before sending:** read it back and ask whether a smart friend with no
coding background would follow it on the first pass. If any sentence would make
them stop and re-read, rewrite that sentence. Being accurate is not an excuse
for being dense.

The root `CLAUDE.md` holds the full word list. It wins if the two ever differ.

## Documentation

Useful repo docs:

- `docs/monorepo.md`
- `docs/local-enviroment.md`
- `docs/scalability.md`

If a change updates repo structure, local ports, root commands, or agent routing, update the relevant docs in the same change.
