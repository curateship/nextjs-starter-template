# Hub Automations

Hub automations are site-scoped node graphs managed at `/admin/automations`. They are separate from newsletter email automations.

The editor follows Trading's workspace interaction: the left palette has Fav and All nodes tabs, a bottom search field, click-to-preview, a separate add button, and drag-to-place. Favorites are selected from the node inspector and remembered in the browser. Run now executes one immediate manual run; Activate enables future scheduled runs.

## Code Layout

- `src/features/automations/` owns graph types, validation, scheduling, and the dashboard/editor UI.
- `src/lib/actions/automations/` owns authenticated actions, execution, AI providers, scraping, routing, and Post creation.
- `src/app/admin/automations/` and `src/app/api/cron/automations/` stay thin.
- The current Drizzle schema is the runtime source of truth. Migrations only describe database cutovers.

## Graph Contract

Every valid graph has exactly one Time node and at least one terminal action node — a Post (Hub blog post) or a Listing (directory listing). Allowed paths are:

```text
Time -> Scraper -> AI Router -> AI Agent -> Post
Time -> Scraper -------------> AI Agent -> Post
Time ------------------------> AI Agent -> Post
Time -> Scraper -> AI Router ------------> Listing
Time -> Scraper -------------------------> Listing
```

AI Router exposes every named route plus Else. Every route must be connected. Graphs must be acyclic, reachable from Time, and lead to a Post or Listing. Invalid graphs may be saved as drafts, but cannot activate or run.

The Listing node reads scraped pages directly (like AI Agent), extracts real business/place listings with its own structured AI call, and drafts one directory listing per business onto the chosen directory template. Listings are **always** drafts — the node cannot publish, in any configuration. Each is stamped `sourceType='automation'` plus a stable per-business `sourceId`, so re-runs skip businesses that already exist (matched by that source key or an existing listing title); extracted addresses are geocoded through the normal directory save path. Skipped businesses are recorded in the run step. A configured default category, when set, is applied as the listing's primary category.

## Execution

- Active schedules are checked every minute. One-time schedules pause after completion.
- A database lock prevents overlapping runs.
- Scraper URLs must use public HTTPS. DNS resolution is pinned and private/reserved addresses, redirects, oversized responses, and slow requests are blocked.
- Content hashes skip unchanged pages and their downstream branches.
- Scraper and AI network failures receive at most two retries. Validation and malformed output do not retry.
- Independent branches continue after another branch fails. Mixed post and failure outcomes are `partial`; no changed input is `noop`.
- Every run snapshots its graph and stores safe per-node summaries, timings, attempts, errors, and created Post/Listing links plus skipped-listing counts. Full scraped text and generated bodies are not stored in run logs.
- Post and Listing HTML is sanitized before storage and slugs remain unique. Listing runs that create nothing (all duplicates) are `noop`.

## Adding A Node

Update the domain union, catalog, parser, validator, canvas presentation, inspector, executor dispatch, database node-kind constraint, focused tests, and this document. Keep credentials server-only and summaries free of scraped or generated body content.

## Verification

Run focused domain tests, the Hub type check and build, then validate creation, editing, connections, draft saving, activation, Run Now, and run history in the browser.
