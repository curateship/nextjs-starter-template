# AGENTS.md

Guidance for agents working in Trading.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Trading docs live in `workspace/docs/`.
- ATrading tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- **Before back-testing any strategy, read and follow `workspace/docs/back-testing-rule.md`.**

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