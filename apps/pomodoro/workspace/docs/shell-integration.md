# Pomodoro and Custom Shell

Pomodoro is a copy of Custom Shell. Accounts, billing, emails, automations,
media, the admin chrome and every settings screen are the shell's, and this app
does not edit them: a shell file changed here is a fork that conflicts on every
future merge. The app's own code is the `_pomodoro` product shell, the six
`/admin/pomodoro-*` pages, `src/lib/pomodoro/`, `src/server/pomodoro/`,
`src/components/pomodoro/` and the three files in `src/app/`.

## What this app claims from the shell

`src/app/options.ts` claims one thing: the front door. `/` serves the timer,
guests included, so the shell's own front page — the pricing landing page and
the front page rows an admin builds in Settings → Public → Pages → Front page —
is not what a visitor to this app's root sees. Those rows still exist and are
still editable; nothing draws them here.

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
