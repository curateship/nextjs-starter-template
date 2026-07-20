# AGENTS.md

Guidance for agents working in Directory.

## App Context

Directory is a Vite and TanStack Start port of Hub. Keep Hub intact, preserve Directory's Vite/TanStack/Nitro runtime, and treat Hub as the database migration owner.

Read `workspace/docs/ui-rules.md` before UI work. Use local code and docs as the source of truth.

## Working Rules

- Keep changes small and direct.
- Do not commit secrets.
- Run the narrowest relevant checks before summarizing work.
- After any browser-facing change, run `.agents/skills/validate-app` and read the browser console. The dev server on Directory's port in `local-apps.json` is already running — use it rather than starting anything. A 200 from `curl` does not prove the page survives hydration.
- Directory renders through RSC. A `"use client"` module must be imported directly by a server component for the client boundary to be created; wrapping it in `@/lib/dynamic` (a client-only helper) resolves it in the server environment, where React has no `forwardRef`. Split heavy code on demand from inside a client component instead.
