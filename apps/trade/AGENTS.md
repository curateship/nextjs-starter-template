# AGENTS.md

## How to reply to Tyler

Use **bold text for the main point and key details** so replies are easy to
scan. Lead with the answer, keep paragraphs short, and use short bullets when
they make the details easier to read. Keep the tone natural and conversational.
Do not turn replies into release notes or checklists, and do not bold entire
paragraphs. Apply this in replies without waiting for Tyler to remind you.

The map for this app is `CLAUDE.md`, in this folder. Read it first. It routes to
the skills in `.agents/skills/`, the shared docs in the repo's `docs/`, and this
app's own docs in `workspace/docs/`, and it holds nothing that is not a pointer.

These rules never wait for a file to be opened:

- **Re-read `.agents/skills/unslop/SKILL.md` before every reply**, not once a
  session, and check your draft against it before sending.
- **Document what you built in `workspace/docs/`** in the same turn as the code,
  and add its line to `workspace/docs/README.md`.
- **Never edit a shell-origin file.** The app's own files, `src/app/`, its
  `drizzle/` migrations and its `.env` are the whole list of what an app may
  change. The repo's `docs/shell/shell-and-apps.md` explains what happens when
  that rule breaks.
- **Never claim a fix caused a result when the result may have come from
  Tyler's own action.** A missing order proves only that the order is missing.
  It does not prove which cancel path removed it. Call a bug fixed only after
  reproducing the failed action against the changed path and measuring its
  result. If that cannot be done, say plainly that the fix is not proven.
- **Never deploy a code or UI change unless Tyler explicitly asks for that
  deployment in the current request.** Local development and local validation
  are the default stopping point. A database change may need a deployment, but
  explain why and wait for Tyler to authorize it. Never treat an earlier deploy
  request as standing permission for later fixes.
- **Never run a full test suite unless Tyler explicitly asks for it in the
  current request.** Use the smallest focused test files that cover the change.
  Do not run `npm run test:app` or the full `npm run test` for an audit,
  pre-commit check or because an earlier request asked for one.
- **Solve small in-scope problems instead of only reporting them.** When a
  clear fix is safe, narrow and does not need Tyler's decision or new
  authority, make the fix and verify it. Tell Tyler about suggestions when he
  needs them to choose a direction, understand a meaningful risk or approve a
  larger change. Stop at diagnosis only when Tyler asked for diagnosis alone,
  the right fix is genuinely unclear or the next action needs his permission.

The monorepo's root `AGENTS.md` covers the repo shape, the ports and which apps
are live. The root `CLAUDE.md` covers how to write and how to treat evidence.
