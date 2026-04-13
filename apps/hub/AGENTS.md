# HUB AGENTS.md

These instructions apply to all work in `apps/hub/`.

## Required Preflight

Before planning or coding in `apps/hub/`:

1. Read `apps/hub/README.md`
2. Read `apps/hub/architecture/architecture-overview.md`
3. Inspect the runtime files directly related to the task
4. Summarize the relevant architecture in 3-5 bullets

Do not skip the runtime inspection step. HUB changes should be based on actual routes, actions, schema files, and renderers, not assumptions.

## Non-Negotiable Rules

- Treat current runtime code and `src/lib/db/schema/**` as source of truth.
- Treat `apps/hub/migrations/**` as historical reference only, not runtime authority.
- Auth is Better Auth. Do not import Supabase-era assumptions into current code.
- Keep admin builder code and frontend renderer code as separate layers.
- Do not treat `NEXT_PUBLIC_APP_DOMAIN` and `NEXT_PUBLIC_APP_URL` as interchangeable.

## Documentation Rule

If a task changes HUB architecture or working conventions, update `apps/hub/README.md`, `apps/hub/architecture/architecture-overview.md`, and this file in the same change.

## Conversation Rules
- In Plan mode: explain to user like he's 5
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.