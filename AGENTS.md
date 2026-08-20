# AGENTS.md

The map for this repo is `CLAUDE.md`, beside this file. Read it first. It routes
to the skills in `.agents/skills/`, the docs in `docs/`, and the four live apps,
and it holds nothing that is not a pointer.

Four rules never wait for a file to be opened:

- **Write the way `.agents/skills/unslop/SKILL.md` says**, in every reply and
  every doc.
- **Never start a dev server.** Use the one already running on the app's port
  from `local-apps.json`.
- **Never edit a shell-origin file from inside an app.** The rulebook is
  `docs/shell/shell-and-apps.md`.
- **Write the doc in the same turn as the code**, in that app's
  `workspace/docs/`.

Working in one of the four live apps means reading that app's own `CLAUDE.md`
first: `apps/custom-shell`, `apps/trade`, `apps/cms`, `apps/video`.
