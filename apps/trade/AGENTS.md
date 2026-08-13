# AGENTS.md

Guidance for agents working in Trade.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Custom Shell docs live in `workspace/docs/`.
- Custom Shell tasks live in `workspace/tasks/`.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- Before building or changing UI, read and follow `../../.agents/skills/Ui-standards/SKILL.md`.

## App Context

Custom Shell is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Custom Shell behavior.

## What Lives Where

Where a new file goes: it joins the folder whose line below covers it. A
genuinely new topic gets a new folder once it has two or more files — a folder
of one file hides more than it organizes.

**`src/server/`** — server-only code. Nothing here may be imported by the
browser; only `src/lib/api/*`, `src/routes/api/**` and `src/server/*` may reach
it.

- `ai/` — the stored AI keys and what each call cost.
- `auth/` — signing in, sessions, passkeys, encryption, rate limits, origins.
- `automations/` — flows, the engine that runs them, executors, runs, pausing.
- `billing/` — Stripe, plans, entitlements, subscription events.
- `content/` — announcements, the changelog, feeds, public and written pages.
- `email/` — sending, newsletters, delivery tracking, unsubscribes.
- `media/` — the media library and the storage bucket behind it.
- `notifications/` — the notification list and the live stream.
- `people/` — accounts, contacts, segments, membership, workspaces, view-as.
- The root holds the spine everything imports (`db`, `schema`, `guards`,
  `test-support`, `app-options`, `app-url`) plus true one-offs
  (`maintenance`, `shell-settings`, `admin-overview`, `ticker`, `traffic`,
  `cleanup`).

**`src/lib/api/`** — every server function, meaning every address the open
internet can call. `guards.test.ts` walks this folder recursively and refuses
any endpoint without a guard. New endpoints go here, never in `src/app/`.

- Sorted into `auth/`, `people/`, `email/`, `billing/`, `content/`, `media/`
  and `automations/`, mirroring `src/server/`. The root keeps the shell's own
  doors and the one-offs (`shell`, `shell-settings`, `feedback`, `traffic`,
  `notification`, `ai`, `maintenance`, `admin-overview`, `admin-cleanup`,
  `error-message`).

**`src/lib/`** — browser-side code that is not a component.

- `ai/` — the one list of AI providers, their models and what they cost.
- `automations/` — the flow graph, the node registry, compiling a flow.
- `billing/` — plan features and summaries, membership figures, event wording.
- `broadcasts/` — newsletter blocks, rendering, drip settings.
- `contacts/` — the segment condition builder and contact sorting.
- `dashboard/` — the admin dashboard's own furniture: which widgets exist, the
  chart colours, the needs-you feed, and the figures still made up.
- `email/` — the browser half of the email flows: change email, carried email,
  sign-in links, delivery wording, escaping text for an HTML mail.
- `feedback/` — feedback statuses, tags and type labels.
- `format/` — turning a raw value into readable text: dates, money, sizes,
  counts, plurals, labels, quoting somebody's words, saying what a bulk action
  did. `format-time.ts` is the one home for dates.
- `hooks/` — the app's own `use-*` screen-behaviour helpers.
- `layout/` — panels, sidebar width, gutters, page width, the focus ring.
- `media/` — cropping, upload rules, orphan detection.
- `nav/` — building links and deciding where to send people, including the
  open-redirect guard and putting list state in the address bar.
- `pages/` — the public-page registry, descriptors and visibility.
- `system-emails/` — the fixed list of system email kinds.
- `toast/` — error toasts and how long a toast stays. Clicks report errors as
  toasts; page loads report them as banners.
- The root keeps the spine (`utils`, `custom-shell`, `app-options`) and the
  handful with no sibling: `branding`, `remembered-choice`, `traffic-beacon`,
  `data-cleanup`, `account-deletion`, `announcement`, `notification-action`.
  The last three would each be a folder of one file, which is worse than
  leaving them here — they join a folder when a second file arrives.

**`src/components/`** — everything drawn on screen, one folder per section.

- `account/` — the account dialog and its tabs. The account area is a dialog off
  the sidebar menu, not a route.
- `admin/` — the admin dashboards and their dialogs.
- `automations/` — the flow canvas, plus `nodes/` for each step's settings panel.
- `broadcasts/` — the newsletter editor, contacts, segments.
- `changelog/`, `feedback/`, `media/`, `settings/`, `system-emails/` — that
  section's screens.
- `home/` — the member home screen. `marketing/` — the pricing page.
- `pages/` — drawing an admin-written public page.
- `shared/` — pieces genuinely reused anywhere, plus `dashboard/` for the cards
  only the admin dashboards use. A card belongs in `dashboard/` only if nothing
  outside a dashboard imports it.
- `shell/` — the whole app frame in one place: the layout, the signed-out
  shell, banners, error pages, plus `sidebar/` and `sticky-header/`.
- `ui/` — the shadcn primitives. Generated; not the place for app code.

**`src/routes/`** — the site's addresses. Folder and file names *are* the URL,
so nothing here is filed by topic. `api/` holds the webhook and streaming
endpoints that need a real URL.

**`src/app/`** — the only folder an app built on this shell may edit. Its
answers to the options the shell offers. Never declares a server function.

**`src/hooks/`** — one file, `use-mobile`, left where shadcn's generator puts
it. The app's own hooks live in `src/lib/hooks/`.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
