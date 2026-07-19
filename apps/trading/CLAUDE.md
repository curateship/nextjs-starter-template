# CLAUDE.md

Guidance for agents working in Trading.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Trading docs live in `workspace/docs/`.
- Trading tasks live in `workspace/tasks/`, sorted into category folders — see `workspace/tasks/README.md` for the map.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- **Before back-testing any strategy, read and follow `workspace/docs/back-guide.md`.**
- **Before building or changing any UI/layout, read and follow `workspace/docs/ui-rules.md`, including its site-gap rules.**
- **Before adding any new page, dashboard, or nav item, read and follow `workspace/docs/app-guide.md`** 
- **Before touching any indicator or strategy, read and follow `workspace/docs/Key-Features/indicator-strategy-parity.md`.**

## App Context

Trading is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Trading behavior.

## Communication Style

- **ALWAYS answer in plain English. This applies to EVERYTHING, every response, no exceptions.**
- Write for a smart person who is NOT a programmer or a trader. Assume no technical background.
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
- Never start a new dev server if one is already running. The app's dev server is on port 3007. If 3007 is taken, that running server IS the one to use — do not spawn another on 3008+. Check with `lsof -iTCP -sTCP:LISTEN -nP | grep :3007` first. (`strictPort` is on, so `pnpm run dev` will error instead of hopping ports.)

## Tools

- Use Playwright to test (not chrome extension)
