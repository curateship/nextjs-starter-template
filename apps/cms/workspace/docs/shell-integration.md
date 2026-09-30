# CMS and Custom Shell

CMS uses the shared Custom Shell code for accounts, billing, automations,
navigation, public pages and settings. Directory routes, tables, migrations,
imports and app options belong to CMS.

The CMS settings tabs are registered in `src/app/options.ts`. Directory and
Listing badges load their own panels through the shell's settings tab
extension. Adding a CMS setting does not require editing the shared settings
page.

CMS enables `workspaces.siteBranding`. A site is branded with **one picture**:
its logo, saved on that site, from which the app makes the dark version and
cuts the browser-tab icons. A site that has uploaded none is drawn with the
app's logo instead. Its share image sits beside it, and both are edited in
Platform settings → General settings, which shows them above the app-wide logo
whenever an app has site branding on.

CMS had a Site identity tab of its own until 27 Sep 2026, with a favicon, a
logo, a dark logo, a share image, the site name and an accent colour. The name
and the colour were second copies of General settings and Public → Styling, and
the favicon and dark logo were two uploads the app now makes itself. Tyler
called it redundant; the tab is gone and nothing it did is lost. The site's
accent colour is Public → Styling → Brand, on `publicTheme.brandColor`,
including colours converted by migration
`0075_custom_shell_public_brand_color`.

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

The shell also takes kinds of row from an app, through
`pages.frontPageRowKinds` and its server half `pages.frontPageRowReaders`, and
CMS registers five: listings, category cards, upcoming events, current deals and
latest posts. That is the whole of the old Settings → Directory → Home page
builder, which is gone along with its table. `workspace/docs/home-page-rows.md`
says what the five hold and what fills them.

A site's `/` is the shell's front page now. This app still claims that address
in its options, but only to forward the deployment's own root to sign-in; a
site's root is answered "not mine" so the shell draws it.

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

Every draggable chip in Settings drags from any part of itself, not only from
the six-dot grip on its left: the public menu's links and dropdown groups, the
action items, the social accounts and the signed-in top-right menu. The cursor
is an open hand over a chip and an arrow over its name, and a click on the name
still opens that chip's window. A chip's window types normally: its box is drawn
outside the chip but React sent its keys up to the chip's drag listeners, where a
space meant "lift this chip" and never reached the box, so a public menu link's
name could not contain a space. The chip's listeners now ignore anything that
did not happen inside the chip itself. Pressing Done in that window also closes
it once: the id a chip is keyed on now survives the link being edited, where
before the edited link got a new id, the chip was rebuilt, and the window it
held was drawn a second time before closing.

Add row opens a window of cards, one per kind of row, with CMS's own five,
Listings, Category cards, Upcoming events, Current deals and Latest posts,
under their own heading and each with its own icon named in `src/app/options.ts`.
Picking a card makes the row and opens it. A row then keeps the kind it was
made with: the row window states the kind and offers no way to change it.

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

Dark mode has a shade setting. Settings > Styling > Dark mode offers Near
black, Charcoal, Graphite and Soft grey, and every grey surface lifts together
so the text keeps the same contrast at all four. A workspace that has never
chosen one reads as Near black, which is the dark mode CMS always had. The
public pages have no shade control and stay near black whatever the signed-in
app is set to.

A page now has three tiers of grey, darkest first: the page behind the cards,
then the sidebar rail and the sticky bar, then the cards. The page is
`--shell-canvas` in `src/theme.css` and the rail is halfway between it and a
card, so a card reads as raised in both light and dark. Styling's old "Main
content area" and "Sidebar & sticky bar" colour pickers are gone, because
`styling.content` blended toward `--muted`, which sits below a card in light
mode and above it in dark, so one saved number turned the page darker than the
cards in one mode and lighter in the other. Both fields stay in the saved row
and the public side still reads them.

Tab strips and the colour-mode switcher move one pill. The raised white
background is a single element behind the buttons rather than a background on
the chosen one, so switching slides it across instead of blinking it from one
place to the next, and `src/lib/hooks/use-sliding-pill.ts` measures it from
whichever button is selected. Flipping light to dark freezes every transition
for two frames so the page does not fade one colour at a time, and anything
carrying `data-keep-motion` is exempt, which is how the switcher's own pill
still slides while the page repaints.

A window's backdrop fades in over the same 150ms as the window, and the blurred
page behind it eases rather than switching on.

A public page keeps the page it is drawing while the next one loads.
`src/lib/hooks/use-painted-pathname.ts` reads the address on screen rather than
the one being fetched, so clicking into the admin no longer re-aligns the front
page for the half second before it goes.

The public footer sits where it is told. Settings > Public > Navigation >
Public footer > Footer alignment offers Follow the site, Left and Centred, and
Follow the site reads Styling > Page frame > Content alignment, which is what
every site saved before the choice existed reads as. The footer reads the
site's own alignment rather than the page's, so a card page centring its one
box says nothing about where the footer belongs.

The front page has its own row spacing. Settings > Public pages > Front page >
Space between rows is a whole number of pixels up to 160, a phone draws 70% of
it because a desktop-sized gap is most of a phone screen, and flat mode still
collapses both. The default is 80px, which is the 5rem `src/theme.css` always
drew.

CMS keeps two shell files forked on purpose.
`src/components/pages/site-search-page.tsx` uses `publicCardHover` from
`src/lib/layout/card-hover.ts` instead of the shell's `hover:bg-accent/40`, so
search results lift and cast a shadow like every other CMS card. It stays a
fork until that hover moves into the shell.
`src/lib/format/bulk-result.ts` counts a third pile, the records that were
already the way the button would set them, which "Change many at once" needs
and the shell's copy does not have. A shell merge must not overwrite it. Both
forks end when the shell takes the same change.

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
