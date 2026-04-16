# HUB AGENTS.md

These instructions apply to all work in `apps/hub/`.

## Required Preflight

Before planning or coding in `apps/hub/`:

1. Read `apps/hub/README.md`
2. Read `apps/hub/architecture/architecture-overview.md`
3. Inspect the runtime files directly related to the task
4. Summarize the relevant architecture in 3-5 bullets
5. Inspect the relevant runtime files for the task before proposing fixes or changes
7. If a change alters HUB architecture or working conventions, update the relevant HUB docs in the same change
8. Do not skip the runtime inspection step. HUB changes should be based on actual routes, actions, schema files, and renderers, not assumptions.


## Non-Negotiable Rules

- Treat current runtime code and `src/lib/db/schema/**` as source of truth.
- Treat `apps/hub/migrations/**` as historical reference only, not runtime authority.
- Auth is Better Auth. Do not import Supabase-era assumptions into current code.
- Keep admin builder code and frontend renderer code as separate layers.
- Treat site navigation and footer as shared structure in top-level site settings, not as page-specific content blocks.
- Do not add special frontend auth/dashboard namespaces. Site auth pages come from the account-pages builder and resolve through normal frontend slugs.
- Do not treat `NEXT_PUBLIC_APP_DOMAIN` and `NEXT_PUBLIC_APP_URL` as interchangeable.
- For large directory datasets, list/search/admin paths must use lean summary queries and must not read `content_blocks` unless loading a single item for editing or rendering.
- Admin create, settings, and block-editor forms should use the shared admin form modal primitives in `src/components/admin/shared/AdminModalLayout.tsx`. Keep feature-specific modal files, but do not hand-roll new dialog chrome for standard builder forms.

## Documentation Rule

If a task changes HUB architecture or working conventions, update `apps/hub/README.md`, `apps/hub/architecture/architecture-overview.md`, and this file in the same change.

## Conversation Rules
- In Plan mode: explain to user like he's 5
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.
