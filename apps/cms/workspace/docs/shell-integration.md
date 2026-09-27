# CMS and Custom Shell

CMS uses the shared Custom Shell code for accounts, billing, automations,
navigation, public pages and settings. Directory routes, tables, migrations,
imports and app options belong to CMS.

The CMS settings tabs are registered in `src/app/options.ts`. Site identity,
Directory and Listing badges load their own panels through the shell's settings
tab extension. Adding a CMS setting does not require editing the shared settings
page.

CMS enables `workspaces.siteBranding`. A site's favicon, logo, dark logo and
share image stay in that site's workspace settings. Public requests read the
site selected by the domain. Empty image fields use the app-wide images.
The Site identity panel edits those fields through the shell's guarded settings
endpoint. The site's accent colour uses `publicTheme.brandColor`, including
existing colours converted by migration `0075_custom_shell_public_brand_color`.

The shell's site-branding contract is documented once in the repo's
`docs/shell/shell-and-apps.md`.

Settings → Public pages → Front page belongs to the site you are in, from
27 Sep 2026. It was one set of rows for the whole deployment until then, which
is why a second website would have opened with the first one's hero. Rows saved
app-wide before that date are still in the app-wide record and are no longer
read or shown here: on Tyler's call every site starts with none and is built
from scratch. A site with no rows draws its header and its footer with nothing
between them, rather than the deployment's own sign-up block. There is no limit
on how many rows a page has.

The shell can also take kinds of row from an app, through
`pages.frontPageRowKinds` and its server half `pages.frontPageRowReaders`. CMS
does not use them yet: its listings, category cards, events, deals and posts
rows are still its own builder in Settings → Directory → Home page, and moving
them across is `workspace/tasks/home-rows/04-one-builder.md`. Until that
happens a site's `/` is answered by CMS's own home page whenever it has rows,
so the shell's per-site front page only draws for a site that has none.

Platform Navigation combines the sidebar and top right menu editors. Top left
max items sits inside the sidebar card and keeps the existing saved limit.
Member Navigation groups the member editors separately. Sidebar sections use
16px gaps to match their card inset, and menu actions stay inside their cards.
CMS-specific settings remain under This app.

Public Navigation is three cards, one per part of a public page: Header layout,
which holds the Public menu and the Action items row, then Breadcrumbs, then
Public footer, which holds Social accounts and Copyright. Public Styling is
five cards: Brand, Page frame, Spacing and borders, Header and footer, and
Modal. Every on-or-off setting in the shell's settings screens is the same
switch row, and a save the server refuses names the field it is waiting for
instead of reporting a save that did not happen.

The shell's optional app-owned left header content keeps the standard sidebar
links as its fallback. CMS leaves this option unset. Worker builds expand the
page registry so CMS's page declarations remain available outside Vite.

## Applying updates

Copy shell-owned files from Custom Shell. Keep CMS's `src/app/`, directory
files, migrations, import scripts, environment and workspace documents.
Preserve the `cms` package name and the import command when merging package
scripts and dependencies. Regenerate the route tree from CMS's combined routes.

Run the full test suite after a shell merge, then the app and Node TypeScript
checks. Validate the existing CMS server on port 3015 in a browser.

CMS also inherits the shell's Storage settings, generated brand images,
plan-change confirmations and header quick settings. CMS keeps its own site
identity panel and directory settings. Sidebar width belongs to each person.

CMS also inherits the shell's public header, footer and breadcrumbs, public
styling presets, resized public pictures, the page loading bar, per-page search
engine controls and the bell that clears its number without marking notices
read.

One container owns a public page's left and right edge. `public-page-frame.tsx`
works that padding out once and hands it to the header, the content column and
the footer, so the logo, the cards and the footer links line up at every window
width, and Settings > Styling > Spacing and borders moves all three together.
Space after the logo, in Settings > Public > Navigation > Header layout, is a
whole number of pixels from 0 to 400 and only applies from 1024px up, where the
menu words are in the bar. The front page can open with a hero row, its blocks
share one vertical spacing, and the plan cards and the FAQ are the shell's.

Each front page row chooses where it sits across the page and which of its
parts a visitor sees. Alignment offers Follow the site, Left, Centred and
Right, and Follow the site reads CMS's own Content alignment setting, so no
row moved when this arrived. The row window is three cards that all fold away,
Row content, the card for the row's kind, then Visibility at the bottom, and
Visibility holds Hide this row from visitors plus a switch for the heading, the
introduction, and the parts that belong to that kind. These are the shell's
app-wide front page rows, not the per-site directory rows, which have their own
editor and are untouched by this.

The public site can read its headings in Libre Baskerville. The face is
self-hosted in `public/fonts/`, alongside Inter, under the SIL Open Font
License, and `src/theme.css` declares it. A shell merge that changes the fonts
has to copy `public/fonts/` as well as `src/`, or the heading font falls back
silently.

CMS keeps one shell file forked on purpose.
`src/components/pages/site-search-page.tsx` uses `publicCardHover` from
`src/lib/layout/card-hover.ts` instead of the shell's `hover:bg-accent/40`, so
search results lift and cast a shadow like every other CMS card. It stays a
fork until that hover moves into the shell.

The current shell includes database migrations through
`0081_custom_shell_per_page_index_controls.sql`. CMS numbers its own migrations
past the shell's, so a shell migration takes the next free CMS number and keeps
its name: the shell's `0080` and `0081` are CMS's
`0102_custom_shell_notifications_seen.sql` and
`0103_custom_shell_per_page_index_controls.sql`. The first adds the bell's
`seen_at` column, and the second adds `hidden_from_search` and `canonical_url`
to written pages. Apply pending migrations
with `npm run db:migrate` against the intended CMS database before running the
updated app. Supply `CUSTOM_SHELL_DATABASE_URL` explicitly; the migration
command does not load a local environment file. The background worker has its own build and start commands,
`npm run build:worker` and `npm run worker`. Production releases must run that
worker for scheduled shell and directory work.

CMS retains its earlier `0077_custom_shell_sidebar_width_per_person.sql`.
The shell's `0078` migration repeats that operation safely. Migration tracking
uses the full filename, so the two `0077` filenames do not conflict.
