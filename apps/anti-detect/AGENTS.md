# AGENTS.md

Guidance for agents working in Antidetect.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Antidetect docs live in `workspace/docs/`.
- Antidetect tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.

## App Context

Antidetect is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Antidetect behavior.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
