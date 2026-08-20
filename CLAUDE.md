# CLAUDE.md

A map of the repo. It holds no rules of its own. Everything it points at is the
rule, and the file it points at is the one to read.

## How to reply

**Read `.agents/skills/unslop/SKILL.md` and follow it in every reply.** It also
covers every summary of finished work and every doc you write. The section at
the end, "Writing for Tyler", is the part that is about him specifically, and it
wins wherever the two halves disagree.

## Where the work happens

Four apps are live, and they are the only ones worked on:

- `apps/custom-shell` — the template every app is copied from.
- `apps/trade`, `apps/cms`, `apps/video` — the products, each a copy of the
  shell.

Each has its own `CLAUDE.md`. Read that app's file before touching that app.
Anything else under `apps/` is on its way out and is not worked on, fixed, or
merged into.

## The docs

`docs/README.md` indexes everything. The ones that change how you work:

- `docs/how-we-work.md` — how a discussion with Tyler goes, when a plan is
  wanted, and what counts as evidence.
- `docs/shell/shell-and-apps.md` — the rulebook for the shell and the apps built
  on it.
- `docs/shell/working-rules.md` — how to scope a change and how to prove it.
- `docs/local-enviroment.md` — ports and dev servers.

An app's own docs live in that app's `workspace/docs/`, and its tasks in
`workspace/tasks/`.

## The skills

`.agents/skills/` holds them. `unslop` is always on. Reach for `check-yourself`
the moment Tyler says an answer is wrong or asks whether you are sure, and
`validate-app` before calling any browser-facing work done.

## Four rules that never wait for a file to be opened

- **Never start a dev server.** Use the one already running on the app's port
  from `local-apps.json`. If that port is serving another worktree, it is not
  yours: say so and stop.
- **Never edit a shell-origin file from inside an app.** An edited shell file is
  a fork that conflicts on every future merge.
- **Write the doc in the same turn as the code**, in the app's
  `workspace/docs/`.
- **Only one shell session per agent.** Finish or close it before opening
  another.
