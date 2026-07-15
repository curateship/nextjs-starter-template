# AGENTS.md

Guidance for agents working in Personal IDE.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Personal IDE docs live in `workspace/docs/`.
- Personal IDE tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- Before building or changing UI, read and follow `workspace/docs/ui-rules.md`.

## App Context

Personal IDE is a Tauri desktop app. It can create isolated workspaces for other apps and start their dev servers from its terminal panel.

Use `local-apps.json` for known local app ports.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
- Update documents when applicable
