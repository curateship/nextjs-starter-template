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
- **`settings.tabs`** — one tab, "Reddit account", holding the account, the proxy
  and the voice the AI writes in.

`src/app/server-options.ts`, which the browser never sees:

- **`background.workers`** — two quick jobs on the shell's ticker: re-testing one
  proxy every ten minutes, and shutting down a browser nobody has used for an
  hour. The slow browser work is deliberately not here; see below.

## The tables it owns

Nine, all named `promo_*` and all in `src/server/social/schema.ts`, which is
promo's own file. The shell's tables stay in `src/server/schema.ts`, which promo
never opens.

`promo_proxies`, `promo_accounts`, `promo_browser_sessions`, `promo_keywords`,
`promo_searches`, `promo_finds`, `promo_drafts`, `promo_comments`, `promo_jobs`.

The SQL is hand-written in `drizzle/0091_promo_reddit.sql` and
`drizzle/0092_promo_reddit_relevance.sql`, numbered past the shell's so a future
shell migration cannot collide with them.

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
