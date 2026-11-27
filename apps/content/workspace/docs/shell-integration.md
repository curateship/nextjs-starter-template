# Content and Custom Shell

Content is a copy of Custom Shell, made as a copy of Video with Promo's and
Viral's own files added (`content-app.md`). Accounts, billing, automations,
navigation, public pages, email and settings are the shell's.

**Never edit a shell file here.** A shell file edited in Content is a fork that
conflicts on every future merge. A change the shell needs is made in
`apps/shell` and carried over. The repo's `docs/shell/shell-and-apps.md` is the
rulebook.

## The files Content differs on

When Content was made on 26 Nov 2026, Video, Promo and Viral were all on the
same shell, and each differed from it on the same few files. Content differs
on these:

- `src/app/options.ts`, `src/app/server-options.ts` and
  `src/app/open-endpoints.ts`: the three apps' answers together
  (`content-app.md`, "The option files").
- `src/routeTree.gen.ts`: written by the route generator from Content's routes.
- `src/theme.css`: Video's, with the three extra faces video text and carousel
  slides are drawn in.
- `package.json`: the name `content`, Video's two extra packages, Promo's two
  proxy packages, and Promo's two browser scripts.
- `.gitignore`, `README.md`, `CLAUDE.md` and `public/fonts/README.md`.

Viral had also changed `src/lib/layout/scaffold-styling.ts`, the styling the
Personal IDE writes when it makes an app. Content keeps Video's.

## What each app recorded before

The three apps' own records of their shell merges, kept as they were.

## From Video

Video is a copy of Custom Shell with the video editor built on top of it.
Accounts, billing, automations, navigation, public pages, email and settings
are the shell's. Projects, clips, exports, media, captions and the research
tools are Video's own.

**Never edit a shell file here.** A shell file edited in Video is a fork that
conflicts on every future merge. A change the shell needs is made in
`apps/shell` and carried over. The repo's `docs/shell/shell-and-apps.md`
is the rulebook.

### The folding menu, 3 November 2026

`src/components/shared/folding-menu.tsx` is the shell's one ⋮ and "+ Add"
dropdown ([docs/shell/folding-menu.md](../../../../docs/shell/folding-menu.md)).
It moved into the shell from Travel on 3 Nov 2026 and was copied into Video
by hand, byte for byte, for the Thumbnail panel's ⋮. The next shell merge
finds the two the same.

### The 3 October 2026 hero background merge

Six shell files came over: the front page model and its test, the front page
rows and their test, the row dialog and the settings schema. `src/theme.css`
gained two rules at the end. No migration: the field it changes already
existed.

**A hero's background colour has two colours now, one per mode.** It used to
be a single hex code used in light mode and dark mode alike, so a pale band
glared on a dark page. Background colour is a list of three. **No colour**
leaves the page showing. **Muted grey** is a slider, 0 to 100, where the left
end is barely off the page and the right end is a clear band, and the same
drag darkens the band in light mode and lightens it in dark mode. **Fixed
colour** is the old colour square and hex box, and a hex is still one colour
in both modes, because that is what a hex means.

Under the slider sit two swatches, the light band and the dark band side by
side, redrawing as you drag.

**Why `theme.css` changed.** An inline `background-color` is one colour and
cannot change when the page turns dark, so the band carries
`--shell-hero-band-light` and `--shell-hero-band-dark` as custom properties
plus a `data-hero-band` attribute, and two rules at the end of `theme.css`
pick between them.

**What a row stores** is `grey-<n>` or `#rrggbb`, never the CSS it becomes,
which is what keeps a settings field from writing CSS into a visitor's
browser.

### The 3 October 2026 picture and picker merge

Seven shell files came over: the hero block, the media picker and its test, the
picture thumbnail, the picture field, the front page row editor and the
feedback box. No migration.

**A hero's picture keeps its own shape.** It used to sit in a fixed 16:9 box
set to fit inside, so a picture that was not 16:9 was drawn small in the middle
of that box with grey bars either side of it. The picture now fills the width
of its column and is as tall as its own shape makes it. A 720 by 720 picture in
a 556px column draws 556 by 556, where before it was 313 by 313 inside a 556 by
313 grey box. Nothing is cropped.

**The media picker is always its own window.** It used to have a second mode
that drew the whole library inside the window that opened it, which in a 96px
picture field stretched the field across the form and ran off the bottom of the
screen. That mode is gone, so the picker opens over the window that asked for
it and Escape closes only the picker.

### The 3 October 2026 merge

Video had been a long way behind: 133 shell files were older copies and 51
shell files were missing outright. All of them are now the shell's current
version. Nothing in Video had edited a shell file, so nothing had to be
untangled. The bigger pieces that arrived:

**The CRM.** Email that comes in becomes a lead you can chase. Admin → CRM is
an inbox of conversations down one side and the lead's own record down the
other. Mail arrives through Resend's inbound webhook on the address set in
Settings → Email → Inbound address, and a reply goes back out from that same
address. A lead is an email address, not a contact, so an inbound address
never adds itself to the newsletter audience. A chase date that passes puts a
notice in the bell.

**Breadcrumbs, and public pages that know their own shape.** Public breadcrumb
trails, per-device rows, social links, the public user panel, header actions,
the theme presets and the styling fields all arrived together.

**Resized images.** `/api/v1/media/resized` serves a public image at the size
the page asks for, rather than shipping the original to a phone.

**A hero's own background colour.** A front page hero row can carry a colour,
painted as a band right across the window whatever its Layout says, with a
switch to run that colour under the menu. With the switch on the menu bar
stops painting its own background, so the colour is what shows through its
blur. Only the top row of the page can do it.

**Also carried:** dark mode's four shades, the sliding pill on tab strips and
the colour-mode switcher, the divider row and the Whole screen layout, the
public menu's text size, the page loading bar, and the settings save that no
longer overwrites an edit made on another card while it was in flight.

### The one file that is a real merge

`src/theme.css` is the shell's, plus Video's own `@font-face` blocks for
Playfair Display, Space Grotesk and Caveat, which are the faces a text clip or
a carousel slide can be set in. Those blocks sit directly after the shell's own
fonts. The shell's Libre Baskerville files were copied into `public/fonts/`
with them, because the shell's Heading font setting names them and a rule
pointing at a missing file is a 404 on a real site.

### Migrations owed

Six, all the shell's, keeping their shell names under Video's next free
numbers:

- `0094_custom_shell_notifications_seen.sql` — the bell's unread count and its
  unread list stop being the same thing.
- `0095_custom_shell_per_page_index_controls.sql` — `hidden_from_search` and
  `canonical_url` on a written page.
- `0096` to `0099` — the CRM: six tables, the inbound address on
  `email_settings`, the reply name, the signature, and the quote switch.

The `crm_follow_up` notice type is added to the `notifications` check
constraint, which is a widening, so no saved notice stops being valid. Apply
them with `npm run db:migrate` and an explicit `CUSTOM_SHELL_DATABASE_URL`; the
migration command does not read a local environment file.

### What stays Video's own

Five files are deliberately not the shell's and a merge must leave them alone:
`src/app/options.ts`, `src/app/server-options.ts`, `src/app/open-endpoints.ts`,
the generated `src/routeTree.gen.ts`, and `src/theme.css`, which is the merge
above rather than a copy.

Three shell dev scripts are deliberately not carried: `crm-samples.mjs`,
`crm-samples.test.mjs` and `send-sample-inbound.mjs`. They seed sample CRM
leads on `npm run db:setup`, which is not something an app's database should
grow on its own. So `scripts/setup-database.mjs` is the shell's file with the
CRM sample step taken out, the same copy Trade carries. A merge that replaces it
with the shell's copy breaks `db:setup`, because the shell's imports
`crm-samples.mjs`.

### Shell merge, 5 October 2026

The shell was merged in again on 5 Oct 2026, from `apps/shell` in ws-4.
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

**This app.** 85 shell files updated, 35 added and 8 removed. Six migrations
were carried, the shell's `0086` through `0091`, as Video's `0100` through
`0105`.

**`src/theme.css` is the one file merged by hand**, as it was on 3 Oct. Video's
copy is the shell's file plus six `@font-face` blocks for Playfair Display,
Space Grotesk and Caveat, the faces video text and carousel slides are drawn in.
It had drifted behind as well as ahead, so it was rebuilt from the shell's
current file with those six blocks put back after the last Libre Baskerville
face. The result differs from the shell by exactly one additive hunk, and
nothing the shell has is missing from it.

### Shell merge, 5 October 2026 (second)

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

### Shell merge, 12 October 2026

Every shell change since the 5 Oct merges is in Video. 58 shell files were
replaced and 6 added. Each replaced file was first matched against every
version of that file in custom-shell's history, and all 58 were unmodified
older shell copies. Nothing was deleted, and no routes were added, so the route
tree needed nothing.

**What arrived.**

- **A page an admin adds has its own picture and a description**, and the
  Pages list block shows chosen pages as cards with both.
- **AI has its own row in Settings**, at Platform settings → AI
  (`/admin/settings/ai`), below Payments. The provider keys card left General.
- **"Test this key" says why a key failed**, in the provider's own words, and
  Gemini runs on 3.8 Flash and 3.1 Pro preview instead of the retired 2.5
  models.
- **A Passkeys switch in Settings → General** turns passkey sign-in off for the
  whole app while keeping saved passkeys for when it goes back on.
- **Three billing fixes.** The checkout return page asks Stripe itself instead
  of waiting for the webhook, a monthly to yearly switch starts a new paid
  period that day, and the `billing.returnPaths` app option names where Stripe
  sends people back to.
- **CRM follow-up reminders read as follow-ups** in the bell and the admin
  Notifications table.
- **`db:setup` uses this app's own Docker Postgres** whenever the database
  address points at this machine, even when it is written out in full.

**Two migrations**, under Video's next free numbers:
`0107_custom_shell_written_page_picture.sql` (shell 0092) and
`0108_custom_shell_written_page_description.sql` (shell 0093). Both are
applied to the local database. The live database still needs them.

**Two files merged by hand.** `src/theme.css` is the shell's current file plus
Video's six font faces, and gained the shell's page-picture spacing; the result
differs from the shell by additions only. `scripts/setup-database.mjs` is
Trade's copy, the shell's file without the CRM sample step, as "What stays
Video's own" explains.

**The AI keys.** The four keys in custom-shell's local Settings → AI
(Anthropic, OpenAI, Gemini and ElevenLabs) were scrambled again with Video's
own encryption key and written into the local database, then read back. The
Gemini and OpenAI keys saved there in August were older ones and were
replaced. Workspace 17 shares this local database, so its Video sees the same
keys. The live site gets its keys from the deploy, which copies them from
`secrets.env`.

**One script test fails, in the shell too.** `worker-page-registry.test.mjs`
expects a page entry without the `blocks: false` field the registry now
writes. It fails the same way in `apps/shell` and the merge did not
touch either file.

### Shell merge, 15 October 2026

Every shell change since the 12 Oct merge is in Video. 23 shell files were
replaced and 8 added, all unmodified older shell copies by the same check as
before. Nothing was deleted, and there are no new migrations.

**What arrived.**

- **The top left of the signed-in header can show a breadcrumb or shortcuts**
  instead of the left menu's links. "Top left shows" sits on Platform settings
  → Navigation for admins and on Members → Navigation for members. Sidebar
  links stays the default, so nothing changes until someone picks another.
- **Adding the app to a phone's home screen works properly.** A web app
  manifest is served at `/manifest.webmanifest`, built from the app's name and
  logo, with the `homeScreen` app option to change where the icon opens.
- **A table's heading row is underlined with the divider colour** from
  Settings → Styling, so it no longer reads as a double line under a panel
  header.
- **Smaller fix:** the rich text editor picked up the shell's latest copy.

**Merged by hand.** `src/theme.css` took the shell's new table heading line
on top of Video's six font faces, with no conflicts. `src/routeTree.gen.ts`
took `/manifest.webmanifest` the same way. `scripts/setup-database.mjs` and
`package.json` stay Video's own.

**Tests.** The type check is clean. Eight tests failed only when three apps'
suites ran at once, and pass alone. **One test fails in the shell too.** `public-branding.test.ts` expects the
public header settings without the `menuFontSize` field the shell now writes.
It fails the same way in `apps/shell`.

### Shell merge, 20 October 2026

Every shell change since the 15 Oct merge is in Video, done in workspace 17
so the Viral project screen could be rebuilt on the shell's three-column
pieces. 90 shell files were replaced and 54 added. Each replaced file was
first matched against every version of that file in the shell's history
(`apps/shell`, and `apps/custom-shell` before the 17 Oct rename), and all 90
were unmodified older shell copies. Six files the shell had deleted were
deleted here: the old Contacts and Segments pages, the old contact window,
`test-with-member-dialog.tsx` and `contact-filter-segment.ts` with its test.
No routes were added, so the route tree needed nothing.

**What arrived.**

- **App roles** beside admin and member, set per app.
- **Contacts and Segments as one three-column dashboard** at
  `/admin/contacts`, with notes on a contact, a CSV import, and the shell's
  three-column pieces in `src/components/shared/` (`ThreePanels`,
  `PanelCard`, `FilterPopover`, mass select, `SearchToggle`,
  `NewRecordDropdown`) and `src/lib/layout/dashboard-place.ts`.
- **Big video uploads** go to storage in pieces, up to 5GB, which needs
  `@aws-sdk/s3-request-presigner` (added to `package.json`, the version the
  shell uses).
- **An automation's test run** picks a contact, and webhooks skip in tests.
- **Dashboard tabs, a Styling setting**, and **saved views in the shell**,
  both made in this worktree's shell the same day for the Viral project
  screen (`docs/shell/three-column-dashboards.md`).

**Four migrations**, under Video's next free numbers:
`0132_custom_shell_app_roles.sql` (shell 0094),
`0133_custom_shell_test_run_contact.sql` (shell 0095),
`0134_custom_shell_contact_notes.sql` (shell 0096) and
`0135_custom_shell_saved_views.sql` (shell 0097). All four are applied to the
local database. The live database still needs them.

**Merged by hand.** `src/theme.css` took the shell's stronger table heading
line on top of Video's six font faces, so it differs from the shell by
additions only. `scripts/setup-database.mjs` stays Video's own: the shell's
copy imports the CRM sample script Video does not carry and names the shell's
own database. `src/app/open-endpoints.ts` stays Video's own, and gained the
export window's "Edited by hand" save, which the guard test found missing from
its list of endpoints guarded deeper.

### Shell merge, 30 October 2026

Video already had nearly every shell change. Five files were replaced, one test
was added and two files deleted.

- **Settings → Styling → Left menu shade**, a slider that sets the left menu
  and top bar between the page colour and a card's colour. `src/theme.css`
  took it by a three-way merge on top of Video's own font faces.
- **Every table line is drawn from one rule**, and a panel header's bottom line
  becomes the table's top line when a table sits right under it.
- **The panel view is gone.** `src/lib/layout/panel-view.ts` and its test are
  deleted, and the shell layout no longer reads them, because Personal no
  longer frames apps that way.

No migration was new. `scripts/setup-database.mjs`, `src/app/open-endpoints.ts`
and `public/fonts/README.md` stay Video's own.

### Shell files carried early, 3 November 2026

The big-files shell parts were built in this worktree's `apps/shell` and the
same files copied here, so Video has them before the next shell merge and
neither side forks. Every file below is identical in both apps. The other
eleven apps pick them up at their next shell merge.

- **Each app sets its own video ceiling** (`media.videoMaxBytes` in
  `src/lib/app-options.ts`, read by `src/lib/media/media-upload.ts`,
  `src/server/media/library.ts` and `src/server/media/video-upload.ts`).
- **Uploads pick up where they stopped and can pause**
  (`src/lib/media/upload-in-parts.ts`, `upload-resume.ts`,
  `src/lib/api/media/media.ts`, and `listUploadedParts` in
  `src/server/media/storage.ts`).
- **The upload line on every page** (`src/lib/media/upload-queue.ts`,
  `upload-speed.ts`, `src/components/media/upload-line.tsx`, drawn by
  `src/components/shell/shell-layout.tsx`; the Media library page uses it).
- **Storage used and its cost** (`media.storageUsed` in
  `src/server/app-options.ts`, `mediaStorageUsed` in
  `src/server/media/library.ts`, `src/lib/api/media/admin-media.ts`,
  `src/lib/media/storage-cost.ts`, `src/components/media/storage-used.tsx`).
- **Storage takes a file from disk** (`uploadFileToR2` in
  `src/server/media/storage.ts`).

Their tests came too. `docs/shell/big-uploads.md` describes all of it.

### Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Video: 72 files replaced and 16 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **The Views button keeps the picked view picked.** It remembers the view last opened on each screen in this browser. It opens that view again on arrival, and has a "No view" row to leave it.
- **The 3 Nov shell clean-up.** The Settings cards share one auto-save hook, one secret key box and one dropdown row. The email and automation editors share one frame. Menu upgrade steps 1 to 12 are gone from `src/lib/workspaces.ts`. On 3 Nov every live site counted (Trade, Fitness, Video, Project, Date, Note, Flowfly, Course and course-de) was on step 12 or later.
- **Pages that open with no signal**, through `useOfflinePages` and `public/offline-worker.js`. Nothing switches it on until the app calls the hook, as `docs/shell/offline-pages.md` explains.
- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **`homeScreen.shareTarget`**, which can put the app in an Android phone's share menu. It does nothing until the app sets it.
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Video already had every one.

**Kept as Video's own.** `src/app/` stays Video's own, and so does `src/app/open-endpoints.ts`, which lists Video's own open endpoints. `public/fonts/README.md` and `src/theme.css` stay Video's own. The shell has not changed either file since Video's copy was taken, so there was nothing to bring in. The shell's sample scripts `crm-samples.mjs`, `crm-samples.test.mjs` and `send-sample-inbound.mjs` were left out, because Video keeps its own `scripts/setup-database.mjs`, which never loads them.

### Shell merge, 11 November 2026

Every shell change since the 7 Nov merge (`e69b7243e`) is in Video, up to the shell at `5131991aa`: 242 files replaced, 179 added and 75 deleted. Each was an unedited older shell copy except `src/theme.css`, which Video adds its own text fonts to; it was merged three ways and is now the shell's file plus those fonts.

**What arrived.**

- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists and Leads as its own section, lead tags, unanswered and forwarded mail, and files on messages.
- **Automations is one three-panel dashboard**: Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Pages, Styling and Navigations sit inside the Admin dashboard.** Navigations' link editors open as popovers, and the header's Settings cog can hold links.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with every Blocks setting on panel cards, edge to edge, Reset panels, and each widget's ⋮ holding its own options.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0156 to 0172. 0164 drops the referral and changelog tables, and 0169 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy.

**Video files changed to follow the shell.** The video studio and the carousel studio put their remembered panel widths on with the shell layout hook's `groupRef`, and the video studio keeps its own `BOTTOM_COLLAPSED_HEIGHT` (the card header's 57px plus 2px), since the shell's resizable panels no longer export it. The new `@tiptap/extension-list` package was added as the shell has it.

**Kept as Video's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator. The shell's `scripts/crm-samples.mjs` stays out, as Video never carried it.

**Checked.** Typecheck is clean, and 4,328 of 4,335 tests pass. These failed before the merge too: delivery and public-branding, which fail in the shell as well, and the guard test, which finds three Video server functions from 5 Nov that it does not list (`sayAgainFn`, `requestSteadyCopyFn`, `scoreFn`). The unsubscribe test timed out in the full run and passes when run alone. Not checked in a browser.

### Shell merge, 11 November 2026 (no success toasts)

Every shell change since `5131991aa` is in Video, up to the shell at `3d6037c83`: 81 files replaced, each an unedited older shell copy. `src/theme.css` is Video's own and was merged three ways, with no conflict: it kept its fonts and took the shell's new rules.

**What arrived.**

- **No success toasts.** Nothing pops up when something works on the shell's
  screens either: Admin, the CRM, Automations, Settings and the rest. Failures
  still raise the red error toast, and work only partly done says the part
  that was not done. `useAsyncAction` takes no success sentence any more.
  Tyler, 10 and 11 Nov 2026: "Remove all success toast", "All of trade and
  shell too", "remove success toast across all these active apps".
- **Panel cards → Opacity** for the first card in each side panel, and no
  space under side panel headers.
- **The sidebar and top bar border have a shade of their own** (Settings → Styling → Sidebar & Top navigation).

**No migration was new**, no file was added or deleted, and no route changed.

**Checked.** Typecheck is clean, and the 345 tests in the changed folders pass. Not checked in a browser: this app's port runs its own
worktree, not workspace-4.

### Shell merge, 12 November 2026

Every shell change since `3d6037c83` is in Video, up to the shell at `9757749ff`: 6 files replaced. Each was an unedited copy of the shell at `3d6037c83`.

**What arrived.**

- **The Automations dashboard block has a ⋮.** Automations and Waiting on you each have an eye and a grip, so an admin can hide one or drag it into a new place. The choice is saved with the site's styling (`hiddenAutomationSections`, `automationSectionOrder`), so no migration.
- **Dashboards block rows are 34px tall instead of 36px**, so 16px sits between one name and the next. Tyler, 11 Nov 2026: "add this same feature for all apps that has dashboards block" and "decrease the gap between the items by 10%".

**No migration was new**, no file was added or deleted, and no route changed.

**Checked.** Typecheck is clean, and the 39 tests in the styling, automations and notes folders pass. Not checked in a browser: no dev server on this app's port runs from workspace-4.

### Shell merge, 15 November 2026

Every shell change since `9757749ff` is in Video, up to the shell at `83d208d87`: 23 files replaced and 4 added. Each replaced file was an unedited copy of an older shell version. Video's `src/theme.css` was merged line by line against the shell at `9757749ff`, so Video's own fonts stay; the one new rule went in with no clash.

**What arrived.**

- **Settings -> Styling -> Sidebar & Top navigation has a Style choice.** Own shade is the look the left menu and top bar always had. Same grey as the page makes the left menu, the top bar and the page one grey, with no line along the left menu's edge or under the top bar. It is `sidebarStyle`, saved with the site's styling, so no migration. Tyler, 14 Nov 2026: "add an option in styling settings to choose between the currant sidebar/topnav styling to this (the bg and the side and top as one gray shade)".
- **Shell polish.** The media picker rings only the picture Select will use. Review and send no longer sends on a stray Enter, and refuses to send until it has counted who gets it. Adding everybody the filters match to a segment asks first. Renaming a big hand-picked segment works. Typed page settings survive opening a block. The Cloudflare R2 card tests new details before saving them instead of saving on a timer.

**No migration was new**, nothing was deleted, and no route changed. `scripts/setup-database.mjs` keeps Video's own version.

**Checked.** Typecheck is clean. The 140 tests in the 9 changed test files pass. Not checked in a browser: no dev server on this app's port runs from workspace-4.

## From Promo

Promo is a copy of `apps/shell`, and shell improvements reach it by
copying the shell's files over again. That only works while promo never edits
one of them, so this file records exactly what promo does instead.

### It forks no shell file

As of 5 October 2026, the only files that differ from `apps/shell` are the
three every app differs on:

- `package.json` — the app's name, its two extra dependencies, and its two extra
  scripts.
- `.gitignore` — promo also ignores `.env` files, which it did before this work.
- `README.md` — the scaffold stub.

Everything else under promo is either identical to the shell's copy or a file
promo created, which has no shell version and so can never conflict.

### The options it sets

`src/app/options.ts`, which the browser can see:

- **`workspaces.whoMayHave: "off"`** — promo is one site. It is a tool one person
  runs against their own accounts, not something with tenants.
- **`settings.tabs`** — two tabs. "Reddit account" picks which browser profile
  and which voice the account uses. "Browsers" holds the machine's limit on
  open browsers and the minutes before an unused one closes.
- **`notifications.describe`** — a dead-proxy notice in the bell gets a globe
  tile and opens that proxy in the Anti Detect dashboard's Proxies. Worked out from the
  notice's own id and words, so no server is asked. Promo's other notices get
  their icon and colour the same way, from their headings.
- **`notifications.detailsFor`**: where a reply, removal, suspension, failure
  or proxy-renewal notice opens, asked from promo's server once per page of
  notices, because those notices' ids cannot carry an address.
  [Promo's bell notices](notices.md) has the rest.

`src/app/server-options.ts`, which the browser never sees:

- **`background.workers`** — the quick jobs on the shell's ticker, listed in
  `src/app/server-options.ts`:
  - re-testing the three proxies that have waited longest, and once an hour
    ringing the bell for a proxy renewing in the next three days;
  - asking once a day for each Reddit account's
    [health reading](reddit/account-health.md);
  - picking a time for each warming account's daily visit;
  - every five minutes, queueing a search for each switched-on keyword whose
    last search is the hours set in Settings → Behaviour old, while the reader
    is awake ([searching again by itself](reddit/finding-posts.md#searching-again-by-itself));
  - every ten minutes, [tidying away old posts](reddit/finding-posts.md#old-posts-are-tidied-away),
    one delete and one update each capped at 500 rows;
  - reading the page a few [link posts](reddit/link-posts.md) point to, four a
    pass, each capped at eight seconds, refusing any address inside the network;
  - looking after the browsers: closing an idle one, marking a dead one,
    removing a container nothing claims;
  - [Medium's upkeep](medium/medium-module.md): every five minutes searching
    each switched-on Medium keyword again once it is due and picking each
    warming Medium account's daily visit, and every ten asking for a fresh
    reading of Medium responses and articles a day old and tidying away old
    stories nobody answered;
  - [X's upkeep](x/x-module.md): every five minutes reading each watched X
    account 15 minutes after its last read and each X keyword 2 hours after,
    while the search accounts are awake, and picking each warming X account's
    daily visit; every ten asking for a fresh reading of X replies and posts a
    day old, each account's mentions and daily look, the day's trends and an X
    browser account's messages, and tidying away old posts nobody answered;
  - [LinkedIn's upkeep](linkedin/linkedin-module.md): every five minutes,
    inside the search accounts' workday, reading each watched LinkedIn person
    or page 30 minutes after its last read and each LinkedIn keyword 3 hours
    after, and picking each warming LinkedIn account's daily visit; every ten
    asking for a fresh reading of LinkedIn comments and posts a day old, each
    account's weekly comments look and numbers, its daily requests, viewers,
    feed and messages, and tidying away old posts nobody answered;
  - [the Bans upkeep](bans.md): every five minutes a time for each warming
    Instagram or TikTok account's daily visit, and every ten the bell for an
    appeal 7 days old with no answer and the weekly look at each banned
    account's app;
  - [the phones' health](phones/phone-health.md): the bell for a phone
    offline, hot, with no signal or nearly full and for a quiet rack, the
    daily [self-test](phones/self-test-and-app-updates.md) on the test phone,
    and once an hour deleting old step pictures and chart readings.

  None of them opens or drives a browser or touches a phone. They ask Docker,
  a proxy or a web page, read rows, or only write a job or a phone action. The slow browser work is deliberately not here;
  see below.

### The tables it owns

Forty, all named `promo_*`, in four files of promo's own. The shell's tables
stay in `src/server/schema.ts`, which promo never opens.

- `src/server/browser/schema.ts`: `promo_proxies`, `promo_proxy_addresses`,
  `promo_profiles`, `promo_profile_folders`, `promo_profile_labels`,
  `promo_profile_events`, `promo_browser_sessions`, `promo_browser_settings`,
  `promo_profile_backups`. These belong to no network.
- `src/server/phones/schema.ts`: `promo_phones`, `promo_racks`,
  `promo_rack_codes`, `promo_rack_nonces`, `promo_phone_actions` and
  `promo_phone_screenshots`, from `drizzle/0212_promo_phones.sql`,
  `promo_phone_settings` from `drizzle/0213_promo_phone_jobs.sql`, and
  `promo_phone_events`, `promo_phone_readings`, `promo_phone_action_checks`
  and `promo_app_rollouts` from `drizzle/0214_promo_phone_health.sql`. These
  belong to no network either.
- `src/server/social/schema.ts`: `promo_voices`, `promo_accounts`, `promo_keywords`,
  `promo_blocked_subreddits`, `promo_subreddit_rules`, `promo_reddit_settings`,
  `promo_searches`, `promo_finds`, `promo_drafts`, `promo_comments`, `promo_jobs`,
  `promo_projects`, `promo_behaviour_settings`, `promo_posts` (posts of your
  own), `promo_notices` (where each bell notice opens), and from
  `drizzle/0218_promo_instagram_tiktok.sql` `promo_app_posts` (Instagram and
  TikTok posts), `promo_profile_edits`, `promo_inbox` and `promo_inbox_seen`
  (messages and comments read off the phones), and from
  `drizzle/0233_promo_projects_dashboard.sql` `promo_projects_pages` (each
  person's left page, sections and Overview layout on the Projects dashboard);
  `drizzle/0234_promo_project_cover_images.sql` adds
  `promo_projects.cover_images` for the shell's Cover photo row.
- `src/server/social/medium/schema.ts`, from `drizzle/0222_promo_medium.sql`:
  `promo_medium_keywords`, `promo_medium_finds`, `promo_medium_hidden`,
  `promo_medium_drafts`, `promo_medium_responses`, `promo_medium_articles`,
  `promo_medium_article_readings`, `promo_medium_publications` and
  `promo_medium_list_items`. The same migration adds `promo_accounts.medium_joined_at`
  and `promo_projects.paused_networks`.
- `src/server/social/x/schema.ts`, from `drizzle/0223_promo_x.sql`:
  `promo_x_settings`, `promo_x_keywords`, `promo_x_finds`, `promo_x_hidden`,
  `promo_x_drafts`, `promo_x_replies`, `promo_x_posts`, `promo_x_communities`,
  `promo_x_list_items`, `promo_x_follows`, `promo_x_searchers`,
  `promo_x_readings`, `promo_x_trends` and `promo_x_mentions`. The same
  migration adds `promo_accounts.x_joined_at`, `x_paid`, `x_reach`,
  `x_reach_at`, `x_follow_back` and `x_help_every`.
- `src/server/social/linkedin/schema.ts`, from `drizzle/0224_promo_linkedin.sql`:
  `promo_linkedin_settings`, `promo_linkedin_projects`, `promo_linkedin_keywords`,
  `promo_linkedin_finds`, `promo_linkedin_hidden`, `promo_linkedin_drafts`,
  `promo_linkedin_comments`, `promo_linkedin_posts`, `promo_linkedin_groups`,
  `promo_linkedin_pages`, `promo_linkedin_connects`, `promo_linkedin_invites`,
  `promo_linkedin_viewers`, `promo_linkedin_searchers` and
  `promo_linkedin_readings`. The same migration adds
  `promo_accounts.linkedin_premium`, `linkedin_seen`, `linkedin_seen_at` and
  `linkedin_code_asked_at`.
- `src/server/bans/schema.ts`, from `drizzle/0225_promo_bans.sql`:
  `promo_bans`, `promo_phone_tenancies`, `promo_ban_phrases`,
  `promo_account_events` and `promo_app_brakes`. The same migration adds
  `promo_accounts.retired_reason`, `retired_note`, `source`, `seller`,
  `price_cents` and `slow_until`,
  `promo_behaviour_settings.app_warm_up_days`, and the Bans entry in the left
  menu after Phones.

The SQL is hand-written in `drizzle/0190_promo_reddit.sql`,
`drizzle/0191_promo_reddit_relevance.sql`,
`drizzle/0192_promo_browser_profiles.sql`,
`drizzle/0193_promo_proxy_and_profile_dashboards.sql`,
`drizzle/0194_promo_voices.sql`,
`drizzle/0195_promo_identity_and_site_check.sql`,
`drizzle/0196_promo_limits_lanes_backups.sql`,
`drizzle/0197_promo_account_health.sql`,
`drizzle/0198_promo_blocked_subreddits.sql`,
`drizzle/0199_promo_comment_examples.sql`,
`drizzle/0200_promo_subreddit_watches.sql`,
`drizzle/0201_promo_subreddit_rules.sql`,
`drizzle/0202_promo_tidy_old_posts.sql`,
`drizzle/0203_promo_comment_checks.sql` and the later files up to
`drizzle/0208_promo_new_features.sql`, which adds the two tables above and
the columns for the 12 Oct 2026 features, and the Today link to saved left
menus. The runner records each file by its
whole name, so a shell file that happens to share a number does not collide
with a promo one.

The 18 Nov 2026 features (`workspace/tasks/New features/new-features-18-nov.md`)
add `promo_post_answers`, the answers sent under your own Reddit posts, and
columns on tables Promo already owns: `promo_projects.ai_cap_cents`,
`promo_keywords.mark`, the numbers, comments and kind of `promo_posts`, and
`promo_app_posts.placement`, in `drizzle/0164` to `drizzle/0168`. No shell
table changes; the shell's `ai_usage_events` is only read.

### Two things that look like shell edits and are not

- **A second worker build script.** The Reddit browser is its own program, and
  the obvious way to build it would be one more entry in
  `scripts/build-worker.mjs`. That is a shell file, and Trade took that road and
  now reconciles it by hand on every merge. Promo has
  `scripts/build-social-browser.mjs` of its own instead. It costs a duplicated
  settings block and forks nothing.
- **A browser image of its own.** `docker/browser/` is copied from
  `apps/anti-detect/docker/camoufox/` rather than shared. Anti-detect's launcher
  waits forever for a person on purpose; promo's has to take instructions.

### Where this screen's panel sizes are remembered

`panelLayoutKey` in `src/lib/layout/panel-layout.ts` is the shell's registry of
its own layout keys, and an app never edits it. `useRememberedPanelLayout` takes
any string, so promo passes `REDDIT_PANEL_LAYOUT_KEY` from
`src/lib/social/options.ts`. The `promo-` prefix is what keeps it from colliding
with a shell key.

### One thing that is not in code at all

**The Projects dashboard is reachable because the sidebar was edited.** The
admin sidebar is saved settings, edited in Settings → Navigation, not a list in a
file. A route file on its own is not a reachable screen. The entry points at
`/admin/projects` and is admin-only. It used to be a Reddit entry pointing at
`/admin/reddit`, an address gone since 13 Nov 2026 ([Old addresses](old-addresses.md)).

`drizzle/0203_promo_comment_checks.sql` writes into those saved settings once:
it puts Comments (`/admin/comments`) under the Reddit link, or adds a Reddit
link with Comments under it to the Administration section where there is no
Reddit link. A sidebar that already has Comments, or was never saved, is left
alone. `drizzle/0206_promo_projects.sql` then turned the saved Reddit entry into
Projects, kept what sat under it, and added Reddit accounts
(`/admin/reddit-accounts`); a sidebar with no Reddit entry got Projects at the
end of its Administration section. `drizzle/0216_promo_project_networks.sql`
took Today, Comments, Reddit accounts and Jobs back out of every saved sidebar,
wherever they sat, when they moved inside each project's Reddit module on 14 Oct
2026 ([Networks as modules](network-modules.md)).
`drizzle/0217_promo_accounts_menu.sql` put Accounts under Projects after
Voices, `drizzle/0218_promo_instagram_tiktok.sql` put Messages after
Accounts, and `drizzle/0226_promo_archive.sql` put the Archive after that.
`drizzle/0233_promo_projects_dashboard.sql` took Voices, Accounts, Archive and
Messages back out of every saved sidebar, wherever they sat, when they became
sections of the [Projects dashboard](projects-dashboard.md) on 12 Nov 2026.
After that the entries are an admin's to move or remove like any other.

### Two shell hazards worth knowing

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

### Applying a shell update

Copy the shell-owned files from `apps/shell`. Keep promo's `src/app/`,
everything under `src/server/social/`, `src/server/browser/`,
`src/components/social/`, `src/lib/social/`, `src/lib/api/social/`,
`docker/browser/`, `worker/src/social-browser.ts`,
`scripts/build-social-browser.mjs`, its `promo_*` migrations, its `.env` files,
its `README.md`, its `.gitignore` and its `package.json` name and scripts. Do not
copy the shell's `workspace/` folder.

Then the app's tests, both type checks, the build, and the screen in a real
browser on port 3018.

### Two shell tests that already fail

Both fail in `apps/shell` itself and came across with the merge on 5
October 2026. Neither is promo's doing and neither can be fixed from here.

- `src/server/guards.test.ts` names `content/page-blocks.ts:loadPublicPageBlocksFn`
  as an endpoint with no guard on it.
- `src/server/public-branding.test.ts` expects a public header without
  `menuFontSize`, which the shell's own code now returns.

### Shell merge, 5 October 2026

The shell was merged in again on 5 Oct 2026, from `apps/shell` in ws-4.
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

### Shell merge, 5 October 2026 (second)

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

### Shell merge, 30 October 2026

Every shell change up to 30 Oct is in Promo: 142 files replaced, 75 added and 6 deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Contacts and Segments are one three-column dashboard**, with CSV import,
  notes on a contact, Filter, New and mass select. The old contacts page,
  segments page and contact window are deleted.
- **App roles.** An app can add its own kinds of account beside admin and
  member. Promo declares none, so every account works as before.
- **Big video uploads** go to storage in pieces, up to 5GB, which needs
  `@aws-sdk/s3-request-presigner`, added to `package.json` at the shell's
  version.
- **An automation's test run picks a contact**, and webhooks skip in tests.
- **Saved views and a Dashboard tabs setting** for three-column dashboards.
- **The front page and `/login` are the sign-in card alone**, and a web app
  manifest is served at `/manifest.webmanifest`, added to
  `src/routeTree.gen.ts` by a three-way merge with no other change.
- **The worker build drops stylesheets**, so a CSS import can no longer stop
  the worker from starting.
- **Every table line is drawn from one rule**, and a panel header's bottom line
  becomes the table's top line when a table sits right under it.
- **Settings → Styling → Left menu shade**, a slider that sets the left menu
  and top bar between the page colour and a card's colour.
- **The panel view is gone.** Personal no longer frames apps that way, so the
  shell deleted `src/lib/layout/panel-view.ts` and its test, and the shell
  layout always draws the left menu and top bar.
- **A three-column dashboard's `place` can say `ready`**, for a screen that
  loads its own list. Nothing changes for a dashboard that does not pass it.

**Migrations owed:** `0127_custom_shell_written_page_picture.sql` (shell 0092), `0128_custom_shell_written_page_description.sql` (shell 0093), `0129_custom_shell_app_roles.sql` (shell 0094), `0130_custom_shell_test_run_contact.sql` (shell 0095), `0131_custom_shell_contact_notes.sql` (shell 0096), `0132_custom_shell_saved_views.sql` (shell 0097). None is applied, locally or live.

**Kept as Promo's own.** `scripts/setup-database.mjs` stays Promo's own, because the shell's copy names the shell's own database; `src/app/` stays Promo's own.

### Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Promo: 85 files replaced and 24 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **Big uploads pick up where they stopped.** An upload carries on after a closed tab and can be paused. A line at the edge of the screen shows it on every page. The Media library shows storage used and its monthly cost. One video is still capped at 5GB unless the app sets `media.videoMaxBytes`, as `docs/shell/big-uploads.md` explains.
- **The Views button keeps the picked view picked.** It remembers the view last opened on each screen in this browser. It opens that view again on arrival, and has a "No view" row to leave it.
- **The 3 Nov shell clean-up.** The Settings cards share one auto-save hook, one secret key box and one dropdown row. The email and automation editors share one frame. Menu upgrade steps 1 to 12 are gone from `src/lib/workspaces.ts`. On 3 Nov every live site counted (Trade, Fitness, Video, Project, Date, Note, Flowfly, Course and course-de) was on step 12 or later.
- **Pages that open with no signal**, through `useOfflinePages` and `public/offline-worker.js`. Nothing switches it on until the app calls the hook, as `docs/shell/offline-pages.md` explains.
- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **`homeScreen.shareTarget`**, which can put the app in an Android phone's share menu. It does nothing until the app sets it.
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Promo already had every one.

**Kept as Promo's own.** `src/app/` stays Promo's own, and so does `src/app/open-endpoints.ts`, which lists Promo's own open endpoints.

### Shell merge, 12 November 2026

Every shell change since the 7 Nov shell at `e69b7243e` is in Promo, up to the shell at `9757749ff`: 267 files replaced, 179 added and 75 deleted. Each replaced or deleted file was an unedited older shell copy, so nothing Promo changed was lost.

**What arrived.**

- **The Admin dashboard is one three-panel screen.** Overview, Users, Plans, Feedback, Announcements, Analytics and the Media library are sections of its Dashboards block, and Pages, Styling and Navigations sit inside it too. Their old separate screens are gone.
- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists, Leads as its own section, lead tags, and Newsletter, Contacts, System emails and Dev outbox inside it.
- **Automations is one three-panel dashboard**, Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with Reset panels, Opacity for the first card in a side panel, and a border shade of its own for the left menu and top bar under Sidebar & Top navigation.
- **The header's Settings cog can hold links**, and Navigations' link editors open as popovers.
- **Nothing pops up when something works.** Success toasts and Undo bars are gone from the shell's screens. Failures still raise the red error toast.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0140 to 0156. 0148 drops the referral and changelog tables, and 0153 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy.

**Kept as Promo's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator, and the shell's `@tiptap/extension-list` package was added. The shell's sample scripts `crm-samples.mjs`, `crm-samples.test.mjs` and `send-sample-inbound.mjs` were already in Promo and stay.

**Checked.** Typecheck is clean in both the app and node configs. Tests were not run. Not checked in a browser: no dev server on this app's port runs from workspace-4.

### Shell merge, 15 November 2026

Every shell change since `9757749ff` is in Promo, up to the shell at `83d208d87`: 23 files replaced and 4 added. Each replaced file was an unedited copy of an older shell version.

**What arrived.**

- **Settings -> Styling -> Sidebar & Top navigation has a Style choice.** Own shade is the look the left menu and top bar always had. Same grey as the page makes the left menu, the top bar and the page one grey, with no line along the left menu's edge or under the top bar. It is `sidebarStyle`, saved with the site's styling, so no migration. Tyler, 14 Nov 2026: "add an option in styling settings to choose between the currant sidebar/topnav styling to this (the bg and the side and top as one gray shade)".
- **Shell polish.** The media picker rings only the picture Select will use. Review and send no longer sends on a stray Enter, and refuses to send until it has counted who gets it. Adding everybody the filters match to a segment asks first. Renaming a big hand-picked segment works. Typed page settings survive opening a block. The Cloudflare R2 card tests new details before saving them instead of saving on a timer.

**No migration was new**, nothing was deleted, and no route changed. `scripts/setup-database.mjs` keeps Promo's own version.

**Checked.** Typecheck is clean. The 140 tests in the 9 changed test files pass. Not checked in a browser: no dev server on this app's port runs from workspace-4.

## From Viral

Viral is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

### Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Viral: 7 files replaced and 0 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Viral already had every one.

**Kept as Viral's own.** `src/app/` stays Viral's own.

### Shell merge, 12 November 2026

Every shell change since the 7 Nov shell at `e69b7243e` is in Viral, up to the shell at `9757749ff`: 267 files replaced, 179 added and 75 deleted. Each replaced or deleted file was an unedited older shell copy, so nothing Viral changed was lost.

**What arrived.**

- **The Admin dashboard is one three-panel screen.** Overview, Users, Plans, Feedback, Announcements, Analytics and the Media library are sections of its Dashboards block, and Pages, Styling and Navigations sit inside it too. Their old separate screens are gone.
- **The CRM is one three-panel dashboard**, with accounts, subscribers and leads as three separate lists, Leads as its own section, lead tags, and Newsletter, Contacts, System emails and Dev outbox inside it.
- **Automations is one three-panel dashboard**, Automations and Waiting on you, with each flow's runs on its own tab and templates in the editor's palette. The old `/admin/automations/<id>` and template addresses are gone.
- **Settings → Styling gained Blocks, widgets, Side panels and Panel cards**, with Reset panels, Opacity for the first card in a side panel, and a border shade of its own for the left menu and top bar under Sidebar & Top navigation.
- **The header's Settings cog can hold links**, and Navigations' link editors open as popovers.
- **Nothing pops up when something works.** Success toasts and Undo bars are gone from the shell's screens. Failures still raise the red error toast.
- **Referrals and the changelog are gone**, along with their tables.

**Migrations.** Shell 0098 to 0114 are this app's 0110 to 0126. 0118 drops the referral and changelog tables, and 0123 deletes the mailing-list contacts marked Account. They run on the local database the next time the dev server starts, and on live at the next deploy. Viral's own 0107 to 0109 wait in workspace-28's commit `41bb8ad94`, which is not in develop yet, so the shell's migrations start at 0110 and the two never share a number.

**One Viral file follows the shell.** `src/lib/layout/scaffold-styling.ts` keeps its values and takes the shell's renamed `ScaffoldStyling` type.

**Kept as Viral's own.** `src/app/`, `scripts/setup-database.mjs` and the route list's own routes; the route list was rebuilt with the router generator, and the shell's `@tiptap/extension-list` package was added. The shell's sample scripts `crm-samples.mjs`, `crm-samples.test.mjs` and `send-sample-inbound.mjs` were already in Viral and stay.

**Checked.** Typecheck is clean in both the app and node configs. Tests were not run. Not checked in a browser: no dev server on this app's port runs from workspace-4.

### Shell merge, 15 November 2026

Every shell change since `9757749ff` is in Viral, up to the shell at `83d208d87`: 23 files replaced and 4 added. Each replaced file was an unedited copy of an older shell version.

**What arrived.**

- **Settings -> Styling -> Sidebar & Top navigation has a Style choice.** Own shade is the look the left menu and top bar always had. Same grey as the page makes the left menu, the top bar and the page one grey, with no line along the left menu's edge or under the top bar. It is `sidebarStyle`, saved with the site's styling, so no migration. Tyler, 14 Nov 2026: "add an option in styling settings to choose between the currant sidebar/topnav styling to this (the bg and the side and top as one gray shade)".
- **Shell polish.** The media picker rings only the picture Select will use. Review and send no longer sends on a stray Enter, and refuses to send until it has counted who gets it. Adding everybody the filters match to a segment asks first. Renaming a big hand-picked segment works. Typed page settings survive opening a block. The Cloudflare R2 card tests new details before saving them instead of saving on a timer.

**No migration was new**, nothing was deleted, and no route changed. `scripts/setup-database.mjs` keeps Viral's own version.

**Checked.** Typecheck is clean. The 140 tests in the 9 changed test files pass except one: the sidebarShade test expects no saved shade, and Viral's own `scaffold-styling.ts` sets 100. Not checked in a browser: no dev server on this app's port runs from workspace-4.
