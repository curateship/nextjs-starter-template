# Trade and Custom Shell

Trade is a copy of Custom Shell with the trading app built on top of it.
Accounts, billing, automations, navigation, public pages, email and settings
are the shell's. Everything about markets, orders, grids, backtests and the
engine is Trade's own, and lives in Trade's own files.

**Never edit a shell file here.** A shell file edited in Trade is a fork that
conflicts on every future merge. A change the shell needs is made in
`apps/custom-shell` and carried over. The repo's `docs/shell/shell-and-apps.md`
is the rulebook.

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

Trade's own `src/components/social/public-profile-dialog.tsx` passed the
deleted `inlinePicker` prop to its profile picture field, so that one line is
removed. The field now opens the picker as a window like every other one.

## What the 3 October 2026 merge carried

**The CRM.** Email that comes in becomes a lead you can chase. Admin → CRM is
an inbox of conversations down one side and the lead's own record down the
other: their stage, what the work is worth, and when to chase them. Mail
arrives through Resend's inbound webhook on the address set in
Settings → Email → Inbound address, and a reply goes back out from that same
address so the answer lands in the CRM rather than in a send-only mailbox.

A lead is an email address, not a contact. Somebody writing in has not asked
for the newsletter, so an inbound address never adds itself to the audience.
It links to a contact only when one already exists on that address, or when
somebody presses Add to contacts.

Replies go out under a name set once in Settings → Email, with a signature of
a name, a business and a phone number under them, and they quote the message
they answer unless that is switched off. Answering a closed or snoozed thread
puts it back in the inbox. A chase date that passes puts a notice in the bell,
and clicking the notice opens that conversation.

**A hero's own background colour.** A front page hero row can carry a colour,
painted as a band right across the window whatever its Layout says, with a
switch to run that colour under the menu. With the switch on the menu bar
stops painting its own background, so the colour is what shows through its
blur. Only the top row of the page can do it.

**Also carried:** the public menu's text size is a setting, chips drag from
anywhere rather than only their grip and slide when dropped, tab strips and the
colour-mode switcher move one pill instead of blinking, dark mode has four
shades, the front page has a divider row and a Whole screen layout, a public
page keeps the page it is drawing while the next one loads, and a settings save
no longer overwrites an edit made on another card while it was in flight.

## Migrations owed

The shell's `0082` to `0085` are Trade's `0198_custom_shell_crm.sql` to
`0201_custom_shell_crm_quote_replies.sql`: the CRM's six tables, the inbound
address on `email_settings`, the reply name, the signature, and the quote
switch. The `crm_follow_up` notice type is added to the `notifications` check
constraint, which is a widening, so no saved notice stops being valid.

**Trade's local database is the live one.** A migration run here is a
production change, so it waits for Tyler's say-so. Apply them with
`npm run db:migrate` and an explicit `CUSTOM_SHELL_DATABASE_URL`; the migration
command does not read a local environment file.

## What stays Trade's own

Four files are deliberately not the shell's and a merge must leave them alone:
`src/app/options.ts`, `src/app/server-options.ts`, `src/app/open-endpoints.ts`
and the generated `src/routeTree.gen.ts`. Everything else under `src/` that the
shell also has is kept byte-identical to the shell's copy.

Three shell dev scripts are deliberately not carried: `crm-samples.mjs`,
`crm-samples.test.mjs` and `send-sample-inbound.mjs`. They seed sample leads
into the local database on `npm run db:setup`, and Trade's local database is
the live one, so sample data here would be sample data in production.
