# Pomodoro and Custom Shell

Pomodoro is a copy of Custom Shell. Accounts, billing, emails, automations,
media, the admin chrome and every settings screen are the shell's, and this app
does not edit them: a shell file changed here is a fork that conflicts on every
future merge. The app's own code is the `_pomodoro` product shell, the six
`/admin/pomodoro-*` pages, `src/lib/pomodoro/`, `src/server/pomodoro/`,
`src/components/pomodoro/` and the three files in `src/app/`.

## What this app claims from the shell

`src/app/options.ts` claims two things. The first is the front door: `/` serves
the timer, guests included, so the shell's own front page — the pricing landing page and
the front page rows an admin builds in Settings → Public → Pages → Front page —
is not what a visitor to this app's root sees. Those rows still exist and are
still editable; nothing draws them here.

The second is the public brand colour. `publicTheme` names the Pomoder orange
and the Pomoder corner radius, so the signed-out pages that stay on the shell's
frame, `/pricing`, `/search` and the missing-page screen, at least share the
product's accent. Only those two fields are named: a value saved in Settings →
Styling replaces whatever is named there, and everything left out keeps the
shell's own look. Why those pages cannot have the product shell is in
[the plans page](plans-page.md).

The third is the sign-in pages' frame. `signIn.frame` hands the shell
`src/components/pomodoro/sign-in-frame.tsx`, so sign in, register, the password
pages and the rest draw inside the product shell around the shell's own card.
See "The sign-in pages" in [The product shell](product-shell.md).

`src/app/server-options.ts` adds four background workers: the room clock,
booked rooms, members' media re-encodes and AI generations. Each is this app's,
run by the shell's worker.

`src/app/open-endpoints.ts` names the one server function that answers before
sign-in, `pomodoro/rooms.ts:lookupRoomFn`, because an invite link has to say
what it points at.

The member pages draw their own sidebar from a fixed list in this app's code and
never read `config.memberSections`, so Settings → App settings → Members →
Navigation edits a saved record no page on this app reads. The shell allows an
app to take that row over with its own screen; this app has not, so the shell's
screen is still drawn there.

## What the merge of 27 Sep 2026 brought

Everything below was built in the shell and arrived here whole. No migration
came with it: the shell's newest table is still `0081`, and this app's own
migrations start at `0082`.

**The settings rail is two cards.** Platform settings holds General settings,
Navigation, Widgets, Styling, Email and Payments. App settings holds this app's
own rows first, then a Members heading over the two member-navigation editors,
then a Public heading over Navigation, Styling, Pages, SEO and Social. Security,
Notifications, Storage and AI are no longer rows: each is a card on General
settings. An old address such as `/admin/settings/storage` lands on General
settings, where the card now lives, with no rail row shaded.

**Every on-or-off setting is one shape.** A switch on the left, the sentence to
its right, longer guidance behind the info icon. The one exception is the small
square that shows or hides a single link inside a menu editor.

**A public page has one left and right edge.** The header, the content and the
footer share it, and Settings → Public → Styling → Content spacing moves all
three together. The header gained a Space after the logo setting and an Action
items row; the footer can now be told to sit left, centre or right rather than
always following the page. Public Styling is five cards and the public site has
a heading font of its own.

**The front page is per site**, each row carries its own alignment and
visibility, Add row opens a window of cards, and there is no cap on how many
rows a page has. This app does not draw that page, so the change is only
visible in its editor.

**One picture brands a site.** The favicon and the dark version are made from
the logo, so there is nothing else to upload.

**Overview reads shorter.** The five headline tiles are a name, a number and
how far it moved, with no small print under a dashed line; the widget headers
carry no grey caption; the dashboard card tabs are pills; a thin bar crosses the
top of the window while the next page loads.

Two fixes in the same merge matter to anyone setting this app up locally:
`db:setup` starts the app's Docker Postgres again when the database address is
on this machine, and the shell's worker build ships the files the worker points
at beside it.

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

**This app.** 113 shell files updated, 45 added and 8 removed. Pomodoro had
never had the CRM, so four whole folders arrived with it: `components/crm`,
`lib/api/crm`, `lib/crm` and `server/crm`.

Ten migrations were carried, the shell's `0082` through `0091`, as Pomodoro's
`0103` through `0112`. They are the CRM's tables, the reply name, the
signature, the quote switch, page blocks, written pages as blocks, the cold
contact status, delivery clicks, the automation engagement index and blocked
senders.

**`landing-timer.tsx` was ported.** Its live-figure rows read
`branding.frontPageRows` from the root loader, which stopped carrying them when
the front page became blocks keyed by site and address. It now reads the page's
own blocks with `loadPublicPageBlocks(FRONT_PAGE_PATH)` and fills the app's own
kinds from `loadAppFrontPageRows`, which is what the shell's own landing page
does. Behaviour is unchanged: only this app's kinds are drawn, a row the app
answers nothing for comes off the page, and a failure leaves the rows off rather
than showing an error to somebody who has not signed up.

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
