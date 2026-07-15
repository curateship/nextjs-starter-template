# AGENTS.md

Guidance for agents working in Custom Shell.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Custom Shell docs live in `workspace/docs/`.
- Custom Shell tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- Before building or changing UI, read and follow `workspace/docs/ui-rules.md`.

## App Context

Custom Shell is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Custom Shell behavior.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
