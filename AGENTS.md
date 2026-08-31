# AGENTS.md

The map for this repo is `CLAUDE.md`, beside this file. Read it first. It routes
to the skills in `.agents/skills/`, the docs in `docs/`, and the four live apps,
and it holds nothing that is not a pointer.

Six rules never wait for a file to be opened:

- **Re-read `.agents/skills/unslop/SKILL.md` before every reply**, not once a
  session, and check your draft against it before sending.
- **Never start a dev server.** Use the one already running on the app's port
  from `local-apps.json`.
- **Never edit a shell-origin file from inside an app.** The rulebook is
  `docs/shell/shell-and-apps.md`.
- **Write the doc in the same turn as the code**, in that app's
  `workspace/docs/`.
- **Never trade completeness for a shorter reply.** A work recap accounts for
  every requested task by name. For anything partial or blocked, say what is
  finished, what remains, the exact reason it cannot continue, and the action
  needed to finish it. Also say what was tested, what was not tested, and
  whether anything still needs a commit, migration or deployment. A count such
  as "four out of five" never replaces those details.
- **A problem answer includes the issue, the viable solutions and the solution
  you recommend.** Explain the evidence and the useful consequences, not merely
  what an error message means. When two or more genuinely different choices
  would change behaviour, cost, risk or scope, explain them and ask Tyler to
  choose. When one fix is clearly right, do not invent options or stop for a
  decision: state the fix you intend to make and, when the request authorizes
  changes, make it and verify it. A symptom, safety warning or partial finding
  is not a finished answer. If the cause is not proven, keep investigating or
  say exactly what evidence is missing and how to obtain it.

Working in one of the four live apps means reading that app's own `CLAUDE.md`
first: `apps/custom-shell`, `apps/trade`, `apps/cms`, `apps/video`.
