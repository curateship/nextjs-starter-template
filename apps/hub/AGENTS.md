# HUB AGENTS.md

These instructions apply to all work in `apps/hub/`.

## Required Preflight

Before planning or coding in `apps/hub/`:

1. Read `apps/hub/README.md`
2. Read `apps/hub/docs/architecture-overview.md`
4. Summarize the relevant architecture in 3-5 bullets
7. If a change alters HUB architecture or working conventions, update the relevant HUB docs in the same change


## Non-Negotiable Rules

- For HUB builder/admin UI requests, make the smallest visible change that satisfies the request. Do not create broad systems for simple chips, badges, warnings, counts, buttons, or modal fields.
- If a HUB change starts needing a new helper, server action, hook, polling loop, schema change, or shared abstraction, first try the direct local implementation. If it still seems necessary, keep the returned data display-ready and the UI dumb.
- If a simple HUB request is growing past roughly 40 lines, stop and explain the tradeoff before continuing. Do not silently keep building.
- Do not add future-proofing states or adjacent behavior unless the user asked for them or the current UI cannot work without them.
- Treat current runtime code and `src/lib/db/schema/**` as source of truth.
- Treat `apps/hub/migrations/**` as historical reference only, not runtime authority.
- Keep admin builder code and frontend renderer code as separate layers.
- Do not ship shortcut props, one-off overrides, or patchwork fixes around builder/editor/rendering abstractions. If a behavior is a real content-type variant, name that variant and wire it through the shared API cleanly.
- Do not treat `NEXT_PUBLIC_APP_DOMAIN` and `NEXT_PUBLIC_APP_URL` as interchangeable.
- For large directory datasets, list/search/admin paths must use lean summary queries and must not read `content_blocks` unless loading a single item for editing or rendering.

## Documentation Rule

If a task changes HUB architecture or working conventions, update `apps/hub/docs/architecture-overview.md`

## Conversation Rules

- In Plan mode: explain to user like he's 5
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.
