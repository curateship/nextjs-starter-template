# CLAUDE.md

Guidance for agents working in Trading.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Trading docs live in `workspace/docs/`.
- ATrading tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.

## App Context

Trading is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Trading behavior.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
- Update documents when applicable