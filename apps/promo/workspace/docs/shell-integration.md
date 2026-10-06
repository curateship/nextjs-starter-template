# What promo changes about the shell

Promo is a copy of `apps/custom-shell`, and shell improvements reach it by
copying the shell's files over again. That only works while promo never edits
one of them, so this file records exactly what promo does instead.

## It forks no shell file

As of 5 October 2026, the only files that differ from `apps/custom-shell` are the
three every app differs on:

- `package.json` — the app's name, its two extra dependencies, and its two extra
  scripts.
- `.gitignore` — promo also ignores `.env` files, which it did before this work.
- `README.md` — the scaffold stub.

Everything else under promo is either identical to the shell's copy or a file
promo created, which has no shell version and so can never conflict.

## The options it sets

`src/app/options.ts`, which the browser can see:

- **`workspaces.whoMayHave: "off"`** — promo is one site. It is a tool one person
  runs against their own accounts, not something with tenants.
- **`settings.tabs`** — two tabs. "Reddit account" picks which browser profile
  and which voice the account uses. "Browsers" holds the machine's limit on
  open browsers and the minutes before an unused one closes.
- **`notifications.describe`** — a dead-proxy notice in the bell gets a globe
  tile and opens that proxy on the Proxies dashboard. Worked out from the
  notice's own id and words, so no server is asked.

`src/app/server-options.ts`, which the browser never sees:

- **`background.workers`** — two quick jobs on the shell's ticker: re-testing the
  three proxies that have waited longest, and looking after the browsers (closing an idle one,
  marking a dead one, removing a container nothing claims). Both only ask
  Docker or a proxy. The slow browser work is deliberately not here; see below.

## The tables it owns

Seventeen, all named `promo_*`, in two files of promo's own. The shell's tables
stay in `src/server/schema.ts`, which promo never opens.

- `src/server/browser/schema.ts`: `promo_proxies`, `promo_proxy_addresses`,
  `promo_profiles`, `promo_profile_folders`, `promo_profile_labels`,
  `promo_profile_events`, `promo_browser_sessions`, `promo_browser_settings`,
  `promo_profile_backups`. These belong to no network.
- `src/server/social/schema.ts`: `promo_voices`, `promo_accounts`, `promo_keywords`,
  `promo_searches`, `promo_finds`, `promo_drafts`, `promo_comments`,
  `promo_jobs`.

The SQL is hand-written in `drizzle/0091_promo_reddit.sql`,
`drizzle/0092_promo_reddit_relevance.sql`,
`drizzle/0094_promo_browser_profiles.sql`,
`drizzle/0095_promo_proxy_and_profile_dashboards.sql`,
`drizzle/0096_promo_voices.sql`,
`drizzle/0097_promo_identity_and_site_check.sql` and
`drizzle/0098_promo_limits_lanes_backups.sql`. The runner records each file by its
whole name, so a shell file that happens to share a number does not collide
with a promo one.

## Two things that look like shell edits and are not

- **A second worker build script.** The Reddit browser is its own program, and
  the obvious way to build it would be one more entry in
  `scripts/build-worker.mjs`. That is a shell file, and Trade took that road and
  now reconciles it by hand on every merge. Promo has
  `scripts/build-social-browser.mjs` of its own instead. It costs a duplicated
  settings block and forks nothing.
- **A browser image of its own.** `docker/browser/` is copied from
  `apps/anti-detect/docker/camoufox/` rather than shared. Anti-detect's launcher
  waits forever for a person on purpose; promo's has to take instructions.

## Where this screen's panel sizes are remembered

`panelLayoutKey` in `src/lib/layout/panel-layout.ts` is the shell's registry of
its own layout keys, and an app never edits it. `useRememberedPanelLayout` takes
any string, so promo passes `REDDIT_PANEL_LAYOUT_KEY` from
`src/lib/social/options.ts`. The `promo-` prefix is what keeps it from colliding
with a shell key.

## One thing that is not in code at all

**The Reddit screen is reachable because somebody added it to the sidebar.** The
admin sidebar is saved settings, edited in Settings → Navigation, not a list in a
file. A route file on its own is not a reachable screen. The entry points at
`/admin/reddit`, is admin-only, and has to be added once per install.

## Two shell hazards worth knowing

**`WorkspacePanel` is not a flex column.** It is `h-full min-h-0
overflow-hidden`, so a child with `flex-1` has nothing to take its height from:
a scroll area inside one grows to its content and the clip hides whatever is
under it. Pass `className="flex flex-col"`, as the Automation Canvas and the CRM
both do. Without it the comment box sat 104 pixels below the bottom of the
window and nothing said so.



**A runtime value imported out of a `@/server/*` module** pulls that module's whole
import graph into the browser's bundle, and the build then refuses it outright
with "Import denied in client environment". It cost one failed build here: a
panel imported the comment length cap from a server module, which reached the
database driver and then the cookie helpers.

Everything both halves need now lives in `src/lib/social/options.ts`, and the
schema imports from there rather than the other way round. Types alone are
erased at compile time and are safe to import from anywhere.

## Applying a shell update

Copy the shell-owned files from `apps/custom-shell`. Keep promo's `src/app/`,
everything under `src/server/social/`, `src/server/browser/`,
`src/components/social/`, `src/lib/social/`, `src/lib/api/social/`,
`docker/browser/`, `worker/src/social-browser.ts`,
`scripts/build-social-browser.mjs`, its `promo_*` migrations, its `.env` files,
its `README.md`, its `.gitignore` and its `package.json` name and scripts. Do not
copy the shell's `workspace/` folder.

Then the app's tests, both type checks, the build, and the screen in a real
browser on port 3018.

## Two shell tests that already fail

Both fail in `apps/custom-shell` itself and came across with the merge on 5
October 2026. Neither is promo's doing and neither can be fixed from here.

- `src/server/guards.test.ts` names `content/page-blocks.ts:loadPublicPageBlocksFn`
  as an endpoint with no guard on it.
- `src/server/public-branding.test.ts` expects a public header without
  `menuFontSize`, which the shell's own code now returns.

## Shell merge, 5 October 2026

The shell was merged in again on 5 Oct 2026, from `apps/custom-shell` in ws-4.
Shell-origin files were replaced wholesale after each one was proved to be an
unmodified older shell version: the app's copy was hashed and matched against
every version of that file in the repository's history. A file with no match is
a real fork and was left alone.

**Never overwritten, in any app.** `src/app/options.ts`,
`src/app/server-options.ts`, `src/app/open-endpoints.ts`, `src/routeTree.gen.ts`
and `src/lib/layout/scaffold-styling.ts`. The first three are the app's own
answers to the shell, the route tree is generated per app, and the styling file
is the live Custom Shell styling that Personal IDE writes into a generated app.

**What arrived.** The CRM, page blocks, the front page editor at
`/admin/pages/edit`, the sliding tab pill, the three-tier dark canvas, blocked
senders, and the smaller fixes between the app's last merge and this one. Plus
the three changes made in the shell the same day: the external-link button that
appears when the pointer is on the workspace block at the top of the sidebar,
Members and Public moving back into the Platform settings card, and
`src/border-first.css`, which stops every divider being drawn near-black for the
first frames of a fresh page load.

**What was deleted.** The shell replaced the settings-based front page row
editor with the page-blocks editor, and moved two of its files into
`src/components/pages/`. The old copies were still sitting in this app, out of
step with the shell they were written against. Every file removed was proved to
have come from the shell, to be gone from the shell now, and to be imported by
nothing outside the group removed with it.

**The route tree was regenerated** with `@tanstack/router-generator` rather than
by starting a dev server. The generator drops the trailing
`declare module '@tanstack/react-start'` Register block that the Vite plugin
writes, and it typechecks fine without it, so the block was put back from the
committed file and the resulting diff checked to be purely additive.

**This app.** 32 shell files updated and 7 added. Nothing was deleted, because
Promo was copied from the shell after the front page editor changed. One
migration was carried: the shell's `0091_custom_shell_crm_blocked_senders.sql`
is Promo's `0093_custom_shell_crm_blocked_senders.sql`.

Promo's own Reddit work under `src/server/social/` was not touched. Its two
typecheck errors about `https-proxy-agent` and `socks-proxy-agent` predate this
merge: both are declared in `package.json` and neither is installed in this
worktree.

## Shell merge, 5 October 2026 (second)

A small one on top of the merge earlier the same day: eight files, no
migrations, no new routes, and nothing for the route generator to rebuild. Every
app was exactly seven files behind and gained one new file.

- **The Tag rule is a combobox.** Contacts → Filters → Tag, and the same field in
  the segment window, now picks from the tags contacts actually carry instead of
  taking comma-separated text. `src/components/ui/multi-combobox.tsx` is the new
  control, built from the Popover, ScrollArea and Badge already here rather than
  from a new dependency.
- **Each block in the page editor's list wears its kind's mark**, the same
  picture the cards on the left use.
- **Both states of the editor's right-hand panel have a button that shuts every
  card at once.** The cards hear it through an optional signal in
  `inspector-card.tsx`, so any panel that puts no button in its header — the
  newsletter editor, the automation panels — is unchanged.
- **The block list's header links to the page itself**, opening it in a new tab.

Nothing was deleted and nothing forked. CMS's `lib/format/bulk-result.ts` is no
longer a fork at all: the previous merge folded its "already that way" count
into the shell's own copy, and this merge confirms the two are identical again.
