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

### Which apps are live

**Three apps are in use. Only these get worked on:**

- CMS: `apps/cms` (3015)
- Trade: `apps/trade` (3014)
- Video: `apps/video` (3016)

**Two are not products but are still live**, and both matter:

- Custom Shell: `apps/custom-shell` (3002) — the template every app is copied
  from. Shell changes reach the three apps above by merging.
- Personal IDE: `apps/personal-ide` — the tool that creates apps from the shell.

**Everything else in `apps/` is kept as reference, and nothing else.**
`ai-agents`, `ai-video`, `analytic`, `anti-detect`, `core`, `directory`, `hub`,
`newsletter`, `pomoder`, `seo`, `trading`.

They are still worth having: when a feature is ported into one of the three live
apps, the older app that already has it is the best description of how it should
behave. `apps/directory` is the clearest example — it is where the multisite and
directory-listing work is read from.

So the rule for them is read, never write:

- **Read them** for behaviour, shapes and edge cases when porting a feature.
- **Do not work in them**, do not fix them, and do not merge the shell into them.
- **Do not judge a change to the shell** by what it would do to them.
- **Do not delete them.** They are the only record of how several features work.

**Why the dead ones cannot come back cheaply.** Nine of them added their own
tables straight into the shell's `src/server/schema.ts` instead of a file of
their own, so that file has drifted 1,300–2,200 lines from the shell's. An
edited shell file is a fork, and it argues on every future merge — which is why
those apps can no longer take shell updates at all. Only CMS, Trade and Video
are still in sync, and keeping them that way is the whole reason for the rule
that an app never edits a shell file.

## Copying A Pattern Means Copying Every Layer Of It

"Copy the pattern from X" means the whole thing, not the layer you happened to
open. Read all four before writing a line:

- **What it looks like** — screen, panels, labels.
- **What it does** — rules, maths, edge cases.
- **How it runs** — a page, a background job, or a program of its own; what
  starts it and how often.
- **What holds it up** — tables, locks, heartbeat, restart behaviour, deploy.

A layer you did not open is a layer you got wrong. The Trade app copied
`apps/trading`'s screens and not its plumbing, so live ladders were driven by
the browser — close the tab and no rung bought and no stop fired, with real
money in the trade. `apps/trading/worker/` had the answer all along: a separate
program, a database lock so only one copy trades, a heartbeat, and an open
socket to the exchange so it is told each price rather than asking.

Before reusing an existing pattern for something new, state what is different
about the new case. Name the layers you actually read in your reply; if you
read one, say one.

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

**After any browser-facing change, run `.agents/skills/validate-app` before reporting the work as done.** Load the page in a real browser and check the console, not just the HTTP status. A build that succeeds, a passing type check and a `curl` returning 200 all say nothing about whether the page crashes once its JavaScript runs — a server-rendered page can return 200 while hydration throws. This does not require starting anything: point the browser at the server already running on the app's port, or at the deployed URL.

**Use Playwright, not the Chrome extension.** The extension times out and leaves you guessing, and a guess about a layout costs a whole conversation. Playwright always answers, and it answers with numbers.

- Import it by path — it lives under `node_modules/.pnpm/`, so a bare `import "playwright"` fails even from the repo root: `node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs`.
- Sign in at `/login` (not `/sign-in`, which 404s): fill `input[type="email"]` and `input[type="password"]`, click `button[type="submit"]`.
- Never wait for `networkidle` on a page that polls — it never fires. Use `domcontentloaded`, then `waitForSelector` on something the page draws.
- **Measure, don't eyeball.** For anything about width, position, overlap or clipping, print `getBoundingClientRect()` and compare `scrollWidth` against `clientWidth`. A screenshot showing "roughly right" has been wrong more often than right, and the numbers say which element is at fault.

App-specific docs live in each app's `workspace/docs/` folder.

App-specific tasks live in each app's `workspace/tasks/` folder.

The single UI standard lives in `.agents/skills/Ui-standards/SKILL.md`. Every app routes UI work to that skill from its app-level `AGENTS.md`; do not create app-local copies that can drift. An app-specific UX document may describe its product without restating or weakening the shared conventions.

## Working Rules

- Each agent may have only one shell session open at a time. Finish or close it before opening another.
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
- **Concise must still feel complete.** Do not answer a question, correction,
  confirmation, or failure with a blunt fragment such as "This doesn't work."
  Acknowledge what the person said, give the useful context, and state what
  happens next or whether anything is needed from them.
- **Do not make Tyler carry the conversation.** When reporting a problem, say
  what failed, what that means, and what you will try next. When confirming
  something, respond naturally instead of ending the exchange abruptly.
- **Explain completed fixes without being asked.** Say what caused the problem,
  what changed, what the user should see afterward, and any setup or limitation
  that remains.
- **Write in natural prose by default.** Use bullets only when a real list or
  comparison makes the answer easier to understand. Do not turn every reply
  into bullet points.
- **Keep bullets short when they are warranted.** Use one idea per bullet and
  one or two short sentences.
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
