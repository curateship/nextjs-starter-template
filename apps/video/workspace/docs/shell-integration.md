# Video and Custom Shell

Video is a copy of Custom Shell with the video editor built on top of it.
Accounts, billing, automations, navigation, public pages, email and settings
are the shell's. Projects, clips, exports, media, captions and the research
tools are Video's own.

**Never edit a shell file here.** A shell file edited in Video is a fork that
conflicts on every future merge. A change the shell needs is made in
`apps/custom-shell` and carried over. The repo's `docs/shell/shell-and-apps.md`
is the rulebook.

## The 3 October 2026 hero background merge

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

## The 3 October 2026 picture and picker merge

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

## The 3 October 2026 merge

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

## The one file that is a real merge

`src/theme.css` is the shell's, plus Video's own `@font-face` blocks for
Playfair Display, Space Grotesk and Caveat, which are the faces a text clip or
a carousel slide can be set in. Those blocks sit directly after the shell's own
fonts. The shell's Libre Baskerville files were copied into `public/fonts/`
with them, because the shell's Heading font setting names them and a rule
pointing at a missing file is a 404 on a real site.

## Migrations owed

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

## What stays Video's own

Five files are deliberately not the shell's and a merge must leave them alone:
`src/app/options.ts`, `src/app/server-options.ts`, `src/app/open-endpoints.ts`,
the generated `src/routeTree.gen.ts`, and `src/theme.css`, which is the merge
above rather than a copy.

Three shell dev scripts are deliberately not carried: `crm-samples.mjs`,
`crm-samples.test.mjs` and `send-sample-inbound.mjs`. They seed sample CRM
leads on `npm run db:setup`, which is not something an app's database should
grow on its own.
