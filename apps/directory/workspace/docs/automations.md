# Hub Automations

Hub automations are site-scoped node graphs managed at `/admin/automations`. They are separate from newsletter email automations.

The editor follows Trading's workspace interaction: the left palette has Fav and All nodes tabs, a bottom search field, click-to-preview, a separate add button, and drag-to-place. Favorites are selected from the node inspector and remembered in the browser. Run now executes one immediate manual run; Activate enables future scheduled runs.

## Code Layout

- `src/features/automations/` owns graph types, validation, scheduling, and the dashboard/editor UI.
- `src/lib/actions/automations/` owns authenticated actions, execution, AI providers, scraping, routing, and Post creation.
- `src/app/admin/automations/` and `src/app/api/cron/automations/` stay thin.
- The current Drizzle schema is the runtime source of truth. Migrations only describe database cutovers.

## Graph Contract

Every valid graph has exactly one Time node and at least one terminal action node — a Post (Hub blog post) or a Listing (directory listing). Source nodes (Scraper, RSS Feed) are interchangeable — both emit `documents`, so either can feed a Router, Agent, or Listing. Allowed paths are:

```text
Time -> Scraper  -> AI Router -> AI Agent -> [AI Image ->] [Approval ->] Post
Time -> RSS Feed -> AI Router -> AI Agent -> [AI Image ->] [Approval ->] Post
Time -> Scraper  -------------> AI Agent -> [AI Image ->] [Approval ->] Post
Time ------------------------->  AI Agent -> [AI Image ->] [Approval ->] Post
Time -> RSS Feed -> AI Router ------------> Listing
Time -> Scraper  -------------------------> Listing
```

The optional AI Image node sits between the AI Agent and the Post. It generates one
featured image from the article's title and summary, uploads it to the site's media
library (a normal `media` row backed by an R2 object), and sets it as the post's
`featured_image`. Image generation is best-effort: if the image provider has no key
or the provider call fails, the node records a clear reason on its step, marks that
step failed, and still passes the article through so the post is created without an
image (the run is then `partial`). Only OpenAI is wired today; the node's provider key
comes from the same per-site AI integration config as the text nodes. There is no model
field — one image model per provider (`AI_IMAGE_PROVIDER_MODELS`), so choosing the
provider chooses the model.

The node takes an optional **reference image** picked from the site's own media library.
With one set, the request goes to OpenAI's `images/edits` endpoint with that picture
attached, so the generated header follows its style and subject; without one it goes to
`images/generations` from the prompt alone. The reference's bytes are read out of object
storage through its `media` row (matched on public URL **and** the automation's site), not
by fetching the stored URL — so the picture is always one this site owns and a run never
makes an outbound request to an address the saved config could point at. The lookup is
restricted to `file_type = 'image'` and the stored `file_size` is checked before anything
is downloaded. If the row is gone, is not an image, is oversized, or cannot be read, the
node reports that reason and the post is still created without an image.

The optional **Approval** node is a "wait for my OK" gate. A run that reaches one stops
there and goes no further on that branch until the owner approves or rejects it. It can
sit anywhere between the AI Agent and the Post — before or after an AI Image — and its
only setting is how long it waits before giving up (1 hour to 30 days, 48 hours by
default). Its allowed targets are deliberately just AI Image and Post, both of which take
exactly one input; that keeps everything after a gate reachable *only* through the gate,
which is what makes resuming a paused run in a later process safe. See
[Approval Gates](#approval-gates) for the run states and the resume/expiry rules.

AI Router exposes every named route plus Else. Every route must be connected. Graphs must be acyclic, reachable from Time, and lead to a Post or Listing. Invalid graphs may be saved as drafts, but cannot activate or run.

The RSS Feed node is a source like Scraper, but reads RSS 2.0, RSS 1.0/RDF, and Atom
feeds instead of raw pages. Per run it fetches each configured feed (same SSRF-hardened
fetch as Scraper — public HTTPS, pinned DNS, no redirects, size cap), normalizes every
entry (title, link, date, summary/content), and emits **only entries not seen on a prior
run** as `documents` the downstream Router/Agent/Listing already consume. Each entry's
identity — feed URL plus its guid, else its link, else a content hash — is recorded in
`site_automation_source_states`, so an immediate re-run emits nothing until the feed
publishes something new. HTML inside a summary is stripped to plain text. A feed that
fails to fetch or is not valid RSS/Atom fails that node's step with a clear message; other
branches continue. Full-article text is out of scope — chain a Scraper after it to fetch
the page behind a feed link.

The Listing node reads scraped pages directly (like AI Agent), extracts real business/place listings with its own structured AI call, and drafts one directory listing per business onto the chosen directory template. Listings are **always** drafts — the node cannot publish, in any configuration. Each is stamped `sourceType='automation'` plus a stable per-business `sourceId`, so re-runs skip businesses that already exist (matched by that source key or an existing listing title); extracted addresses are geocoded through the normal directory save path. Skipped businesses are recorded in the run step. A configured default category, when set, is applied as the listing's primary category.

## Execution

- Active schedules are checked every minute. One-time schedules pause after completion.
- The same cron tick also resumes approved runs and expires unanswered ones (see
  [Approval Gates](#approval-gates)).
- A database lock prevents overlapping runs.
- Scraper and RSS Feed URLs must use public HTTPS. DNS resolution is pinned and private/reserved addresses, redirects, oversized responses, and slow requests are blocked.
- Content hashes skip unchanged Scraper pages, and per-entry state skips already-seen RSS Feed entries; either way an unchanged source yields no downstream work.
- Scraper and AI network failures receive at most two retries. Validation and malformed output do not retry.
- Independent branches continue after another branch fails. Mixed post and failure outcomes are `partial`; no changed input is `noop`.
- Every run snapshots its graph and stores safe per-node summaries, timings, attempts, errors, and created Post/Listing links plus skipped-listing counts. Full scraped text and generated bodies are not stored in run logs.
- Post and Listing HTML is sanitized before storage and slugs remain unique. Listing runs that create nothing (all duplicates) are `noop`.

## Approval Gates

**Run states.** A run is `waiting` while any gate in it is open. It ends as `rejected` if a
gate was rejected, `expired` if one timed out, and otherwise by the normal rules
(`success` / `partial` / `failed` / `noop`). A decision that stopped the run wins over the
normal outcome, even when another branch of the same run did create something — that is
the most useful single label for it. Step statuses gain `waiting`, `rejected`, and
`expired` to match. A `waiting` run has no completion time or duration until it finishes.

**Pausing.** Reaching a gate writes a row in `site_automation_approvals` holding the
article the run is carrying, a deadline, and a safe display summary (title, excerpt, word
count). The gate's step goes `waiting`; every step after it stays `pending`. The run then
releases the automation's lock and keeps its schedule — a human may take days, and the
automation should not be blocked meanwhile. The owner gets a Hub notification
(`automation_approval`) pointing at the automation, where the paused run's approve/reject
card sits in the run history panel.

**Deciding.** A gate is identified by its own random ID and can only be decided by the
user who owns the site behind it, so the notification's link is neither guessable nor
usable by anyone else. Every decision is claimed with a `status = 'pending'` condition,
which makes it single-use. Rejecting ends the branch immediately. Approving only records
the decision; the cron runner performs the resume.

**Resuming.** Each cron tick runs approved gates before starting new scheduled runs. A
resume takes the automation's lock, replays *only* the nodes after the gate, and uses the
run's own graph snapshot — so edits made to the automation while it waited cannot change
what was approved. The held payload is consumed (set to null) *before* the downstream work
runs, so a process that dies mid-resume fails the run cleanly rather than creating the
post twice; a cleared payload is also what marks a gate as already used. If a resume
fails, the gate's step is marked failed and the branch is closed rather than left hanging.

**Expiry.** The same tick expires any pending gate past its deadline: the gate's step
becomes `expired`, everything after it is `skipped`, and the run closes as `expired`. A
paused run therefore never sits in the list forever.

**Run status is derived from the persisted steps**, not from in-memory results, so the
first pass and every resume judge a run the same way. `stepCreatedContent` in
`execution.ts` reads the summaries `summarizeOutput` writes; the two must stay in step.

A run's final status only overwrites the automation's headline `lastRunStatus` when it is
still that automation's newest run, so a run approved late cannot overwrite a fresher
result.

## Adding A Node

Node kinds are defined by a registry, so a new kind is a few colocated additions
rather than edits scattered across the codebase:

1. **Type** — add the node interface and the `AutomationNode` union member in
   `src/features/automations/domain/types.ts`.
2. **Domain descriptor** — write `domain/nodes/<kind>.ts` (metadata, default config,
   output ports, config parse + validate, allowed connections, and optional resource
   checks) and add it to the ordered list in `domain/node-registry.ts`. This one file
   drives the palette catalog, the parser, the validator, and the connection rules.
3. **UI** — add an entry to `components/editor/node-ui.tsx` (icon, canvas description,
   and the inspector config panel).
4. **Executor** — add an entry to `lib/actions/automations/node-executors.ts` (retry
   policy + `run`) with its implementation in `lib/actions/automations/nodes/<kind>.ts`.

No database migration is needed for a new node kind — the run-step node-kind check
constraint was removed; the registry is the source of truth. Add focused tests and
keep credentials server-only and run summaries free of scraped or generated body
content.

The one exception to step 4 is the Approval node, which has no executor: pausing a run
cannot be expressed by returning a value, so the graph runner handles it directly. That
is why `node-executors.ts` is keyed by `ExecutableAutomationNode['kind']` rather than
every node kind.

## Verification

Run focused domain tests, the Hub type check and build, then validate creation, editing, connections, draft saving, activation, Run Now, and run history in the browser.
