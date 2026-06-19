# AGENTS.md

Guidance for agents working in Hub.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Hub docs live in `workspace/docs/`.
- Hub tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.

## App Context

Hub is the main Next.js app and the production Docker target.

Use Hub runtime code and the current Drizzle schema as source of truth. Treat historical migrations as reference only.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- If a change updates Hub architecture or working conventions, update the relevant Hub workspace docs.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
