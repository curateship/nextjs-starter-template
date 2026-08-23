# AGENTS.md

The map for this app is `CLAUDE.md`, in this folder. Read it first. It routes to
the skills in `.agents/skills/`, the shared docs in the repo's `docs/`, and this
app's own docs in `workspace/docs/`, and it holds nothing that is not a pointer.

Three rules never wait for a file to be opened:

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

The monorepo's root `AGENTS.md` covers the repo shape, the ports and which apps
are live. The root `CLAUDE.md` covers how to write and how to treat evidence.
