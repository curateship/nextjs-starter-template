# AGENTS.md

Guidance for agents working in Directory.

## App Context

Directory is a Vite and TanStack Start port of Hub. Keep Hub intact, preserve Directory's Vite/TanStack/Nitro runtime, and treat Hub as the database migration owner.

Read `workspace/docs/ui-rules.md` before UI work. Use local code and docs as the source of truth.

## Working Rules

- Keep changes small and direct.
- Do not commit secrets.
- Run the narrowest relevant checks before summarizing work.
