# AGENTS.md

Guidance for agents working in Directory.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Directory docs live in `workspace/docs/`.
- Directory tasks live in `workspace/tasks/`, sorted into category folders — see `workspace/tasks/README.md` for the map.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- Before building or changing UI or layout, read and follow `../../.agents/skills/Ui-standards/SKILL.md`.
- **Before touching admin feedback — toasts, errors, saves, loading — read and follow `workspace/docs/admin-action-feedback.md`.** Deletions and other destructive actions follow `workspace/docs/destructive-confirm-dialogs.md`.

## App Context

Directory is a multi-tenant directory platform: one deployment serves many sites, each with its own listings, events, products, newsletters, and members. It is a TanStack Start app in the monorepo. Public pages are server-rendered screens resolved through `src/lib/page-renderer.tsx`; the admin dashboard lives under `src/screens/admin/` and fetches its data on the client by design.

- The dev server port is 3011, assigned in the repo root's `local-apps.json`. Never start a dev server — use the one already running (the root `CLAUDE.md` has the full rules).
- Database migrations belong to the hub: numbered SQL files in `apps/hub/migrations/`. This app never gets its own migrations folder.

Use this app's local code, config, and workspace docs as source of truth for Directory behavior.

## Communication Style

- **ALWAYS answer in plain English. This applies to EVERYTHING, every response, no exceptions.**
- Write for a smart person who is NOT a programmer. Assume no technical background.
- Avoid jargon. If a technical term is unavoidable, explain it in everyday words the first time.
- Prefer short sentences, everyday analogies, and concrete examples over precise-but-dense wording.
- Still be accurate and honest — plain does not mean vague or dumbed-down on the facts.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
- Update documents when applicable

## Tools

- Use Playwright to test (not chrome extension)
