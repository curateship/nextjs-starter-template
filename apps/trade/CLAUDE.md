# CLAUDE.md

This file is a map. It holds no rules of its own. Everything it points at is
the rule, and the file it points at is the one to read before you start.

Two folders hold everything. **The repo's `docs/`** covers what is true of every
app, and **this app's `workspace/docs/`** covers what is true of this one.
Paths below say which is which.

## How to reply

**Re-read `.agents/skills/unslop/SKILL.md` before every reply**, not once a
session, and check your draft against it before sending. It also covers every
summary of finished work and every doc you write. Tyler is
smart and is not a programmer or a trader, so the plainest true sentence always
wins.

The monorepo's root `CLAUDE.md` adds the banned-word list, the rule about
leading with the answer, and how to talk about money. It is part of the unslop
skill and gets re-read on the same terms.

## Before you write code

1. `workspace/docs/README.md` lists this app's own docs. Read the ones that
   cover what you are about to change.
2. The repo's `docs/shell/what-lives-where.md` says which folder a new file
   belongs in.
3. The repo's `docs/shell/shell-and-apps.md` is the rulebook for the shell and
   the apps built on it. Read it before touching any file outside `src/app/`
   and the app's own files, because an edited shell file is a fork that
   conflicts forever.
4. The repo's `docs/shell/working-rules.md` says how to scope the change and how
   to prove it.
5. For anything drawn on screen, `.agents/skills/Ui-standards/SKILL.md` is the
   single UI standard. There is no app-local copy.

The repo's `docs/README.md` indexes the rest: architecture, accounts and
billing, security, the UI rules, the performance rules, deployment and local
setup. If the work came from a task, the task files are in `workspace/tasks/`.

## After you write code, write the doc

Every change that a person could later ask about leaves a doc behind. This is
part of the work, not a favour, and it happens in the same turn as the code.

- **New behaviour gets a new file** in `workspace/docs/`, named after the thing
  it explains, plus one line in `workspace/docs/README.md`.
- **Changed behaviour edits the file that already describes it.** Search
  `workspace/docs/` first. Two docs describing one thing is worse than none,
  because the reader cannot tell which one is current.
- **Write what the app does and why, not what you did.** A doc is not a
  changelog entry. Dates belong in a line only when the behaviour changed on
  that date and older records still show the old behaviour.
- **A rule Tyler stated out loud goes in the doc that holds the rules**, in his
  words. That file outranks the code.
- **Behaviour that belongs to the shell is documented in the repo's
  `docs/shell/`**, one copy for every app. Never copy a shell doc into an app.

## Skills

Repo skills live in `.agents/skills/`. Read the whole `SKILL.md` before acting
on it.

- `unslop` — how to write. Always on.
- `Ui-standards` — the one UI standard for every app.
- `plan-change` — turn a request into a spec and an ordered plan.
- `implement-change` — build a focused change or bug fix.
- `validate-app` — open the change in a real browser and read the console.
- `audit-change` — check a change for correctness, security and bloat.
- `check-yourself` — when Tyler says an answer is wrong, or asks if you are
  sure. Stop and prove it instead of defending it.
- `commit-change` — only when Tyler asks for a commit.
- `ship-release` — only when Tyler asks for a deploy.
- `migrate-legacy-code`, `new-features-suggestion`, `polish-app-suggestions` —
  as their descriptions say.

## Verifying

The repo's `docs/shell/working-rules.md` has the commands. Two of them are
absolute: never start a dev server, and never call browser work done without
opening it in a real browser through the `validate-app` skill.
