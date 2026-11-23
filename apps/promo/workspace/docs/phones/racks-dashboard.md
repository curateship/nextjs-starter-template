# Phones and racks

A rack is the computer the phones plug into, with the rack program on it.
Every phone, on every rack, is listed in the Phones section of [the Anti
Detect dashboard](../anti-detect-dashboard.md) (`/admin/anti-detect?section=phones`),
and the racks are blocks on that dashboard's left page. A rack has no page of
its own (Tyler, 12 Nov 2026: "I dont think a rack needs its own dashboard.
The racks dashboard should list all the phones and the phones can just be
filtered by rack tags. So rack name on the dashboard can be renamed to
\"Phones\" and in phones dashboard can be filtered by racks"). Before that,
"all of these can be blocks", of a rack page's Phones, Rack program, Shelf
and Mix cards.

Tyler chose real phones for the important Reddit, Instagram and TikTok
accounts on 9 Oct 2026, with throwaway accounts staying on browser profiles.
His rule of 5 Oct 2026 holds here: devices are app-wide records with their own
dashboard, never something tucked into one network's settings.

## The Phones section

- **The middle** is every phone on every rack, in the phones list below. The
  Racks block picks one rack (`?rack=<id>`), or No rack for the phones none
  has yet (`?rack=none`), and picking it again lets it go. A picked rack adds
  its Wall and Jobs tabs, since a wall and a job queue are a rack's own.
- **The Projects block** narrows the list to the phones a project's accounts
  are on, so the list's own Project filter is not offered here.
- **The right panel** is the open phone with its live screen, below. A list
  with phones opens its first on arrival.
- **The ⋮** after New phone holds New rack, Pause every rack (or Resume), and
  Self-test and app updates, each one switch for every rack ([the self-test
  and app updates](self-test-and-app-updates.md)). While every rack is
  paused, a line under the list says so.
- The list reads again every 10 seconds while it is in view.

## The rack blocks

On the Anti Detect dashboard's left page, all in the "/" list, a new page
starting with them: Racks and Phones. Phones shows the rack picked in
Racks, or every rack together while none is (Tyler's answer: "Every rack
together"). There is no Mix block, nor any count of how alike the phones are
(Tyler, 12 Nov 2026: "remove the mix block and its feature").

- **Racks**: every rack with its phones online out of all of them ("1/2"),
  and No rack while a phone has none. A press shows that rack's phones in
  Phones, from any section. Its ⋮ holds **New rack**, and for the rack
  picked, **its settings** (a window with its name, its description and its
  "/" notes, each saving itself), **Disconnect** for a connected rack, or
  **Delete** for one that is not. A connected rack can't be deleted; a
  deleted rack's phones move to No rack and keep their history, readings and
  finished actions; its bell notices go with it.
- **Phones**: the phones in view counted as connected, busy, held and
  offline, and the jobs waiting: the picked rack's, or every phone's with
  none picked. No rack has no Jobs waiting row, since jobs are counted by
  rack. A status's row sets that status in
  the list, and pressing it again takes it away; Jobs waiting opens a picked
  rack's Jobs tab.

A rack's **program** is the **Rack program** tab of the left page's ⋮ (after
General and Widgets): for the rack picked, whether it checks in, the
computer, the program's version, when it paired, the iPhone tool's signature
date (red once it has passed) and what its last update did; a rack that
never paired, or was disconnected, shows how to install it, with a code for
that rack. With none picked, each rack's check-in, a press picking it. A
rack's **Shelf** and **Log** are tabs of the phones list (Tyler, 12 Nov 2026:
"Shelf can go in the tabs instead of block. Move the rack program into the
settings tab. Logs block goes into tabs").

A rack's banner went with its page: nothing draws one now, and saved banners
stay in the database unused.

## Making a rack and pairing it

A rack is made by a person first and the program joins it, rather than the
program making the rack when it pairs (`drizzle/0139_promo_racks_dashboard.sql`).

- **A code belongs to one rack.** It is made in the Rack program block for
  that rack, or by the New rack window, works once, for 15 minutes, and its card counts the
  minutes it has left, with New code beside it.
- **Only a rack that is not connected gets a code**: one that never paired, or
  one that was disconnected. A code for a connected rack would let a second
  computer take its key and knock the first one off without a word, so the
  server refuses it. To move a rack to another computer, disconnect it first.
- **Pairing keeps the rack's name and description.** The name the program
  sends is not used. A disconnected rack that pairs again is connected again.
- **"Paired"** shows in the window or card the moment the program has spent
  the code: while a code shows, it asks every 3 seconds.
- **A rack that never paired has no key**, so nothing can sign as it, and it
  never rings the "not checking in" bell.

### A rack's notes

In the rack's settings window, from the Racks block's ⋮. The shell's editor
with "/" blocks copied from Project (Tyler, 5 Nov 2026:
"Need tiptap editor with blocks ability too"). Typing "/" at the start of a
line or after a space lists:

- **Image**: uploaded to the media library, or a pasted `https://` address.
- **Video**: a YouTube, TikTok, Instagram or Loom link, playing only once its
  still is pressed.
- **Callout**: a Note, Warning or Decision box of words.
- **Divider**: a line across the notes.
- **Fold section**: a heading that hides what is under it, for this reader
  only, kept on this computer.
- **Links**: labelled web addresses, one a line.

The notes save themselves, as the description beside them does. Project's Task card, File,
Video-or-Promo and Web page blocks are left out, because a rack has none of
those. Checklist is left out too, because it needs Tiptap's list extension,
which Promo does not carry. The rules for what notes may hold are in
`src/lib/phones/rack-notes.ts`, checked in the editor and on the server.

## The phones list

- **Tabs**: Phones with its count, and Shelf, Wall, Jobs and Log while one
  rack is picked. Shelf draws the rack's shelf by slot: clicking a phone
  opens it; clicking an empty slot lists the phones with no slot, and picking
  one puts it there. Log is the rack program's own last lines. Wall is the
  rack's live pictures and Jobs every job on its phones ([seeing the rack](seeing-the-rack.md)),
  in the shell's table: the job, the account, the status, when, and Cancel or
  Try again (Tyler, 6 Nov 2026: "jobs tab should have normal tables").
- **The toolbar**, in the UI standard's order: "N selected" while phones are
  ticked, Mass select, the search, Filter, Views and New phone.
- **Filter** is the shell's popover: Status, Kind, Carrier, Project, Banned
  on, Wiping, Folder, Label and Tag, then Group (by status or by kind), then
  Clear and Save as view. **Views** lists the views saved here, and the one
  picked shows its name in the moving rainbow edge in place of "Views" (Tyler,
  5 Nov 2026: "Use the ui standard filter and save filter feature with saved
  filter rainbow button"). A view is per person and per rack picked, or every phone's with none.
- **Every filter lives in the address**, as `?status=offline&phoneKind=iphone`, so
  a link opens the same list. A value no phone has stays picked rather than
  being dropped.
- **Mass select** shows tick boxes; the "N selected" menu holds Hold, Release,
  Put on a rack, Move to folder, Set label and Add tag, each one request. Put
  on a rack shows a phone on that rack before it is plugged in; plugging it
  into another rack still moves it there.
- **The rows** sort by shelf slot, so the list reads like the shelf: first the
  phone drawn small with Apple's logo or Android's robot, where the slot
  number was (Tyler, 12 Nov 2026: "put the phone icon where the slot is"),
  then the phone with "Slot 3" first on its second line (12px from the
  drawing; the open phone has the sliding bar beside its name, not a grey
  shade: "use this slected animation"), its model, system version, folder, tags, accounts, app
  versions, "Self-test phone", the amber setup line and "Banned on", its
  status, carrier and when the rack last saw it. The columns fold by the
  panel's own width, not the window's: under 768px of panel the account moves
  under the name and the carrier goes; last seen shows from 1024px.
- **New phone** is a dropdown, not a window: the name, then the serial and
  kind, then the shelf slot and how it goes online, with Create phone. The
  phone is made on the rack picked, or with none picked on the rack chosen
  in its Rack field, and opens on the right. The serial is
  checked as it is typed, and one another phone has says so before Create.

## The open phone

- **The frame** is the shell's record frame, as every right panel's: the
  header is the phone's name and status, Hold or Release, the ⋮ and the
  collapse button, with no ×; its cards run edge to edge ("the right cards
  are not flushed to the edge"); and its footer is the typing box, with the
  keys (Back, Home, Recent apps, Enter, Delete a letter) under it ("The icon
  controls goes into the footer bottom and the phone chat goes a row above
  it"). The bigger screen window keeps them in its Control card.
- **The Phone tab is the live screen** ([the screen](screen-window.md)). The
  tabs' box is the phone itself (Tyler's pick, 12 Nov 2026, of "this gray
  area here should be the same dimesion as the phone"): a phone's rounded
  corners and outline, and under the tabs a grey screen in a phone's shape,
  as tall as the box is wide times 176/96. The picture fills it; while there
  is none, Apple's logo or Android's robot by the phone's kind, with why
  there is no picture under it. The bigger screen window still draws a phone
  in outline with the words on its screen.
  Under the screen, at the bottom of the phone on white, the phone's own
  details as rows: Name, Kind, Model, the system version, the serial (UDID
  on an iPhone) and Notes, each saving itself as in Settings (Tyler, 12 Nov
  2026: "move these info to the bottom of the phone", then "put the details
  bg to white").
- **Four tabs under the header**, Phone, Health, Jobs and History (Tyler, 12
  Nov 2026: "Add 3 tabs here. first tab Phone, Health, Jobs", then "make the
  tabs as if its part of the phone", with his drawing, then "move history as
  its 4th tab"): the top of the phone's
  rounded box, underlined in a white strip with a line under it, and what
  the tab shows inside the box below. **Phone** is the screen's picture, with
  Sign-in codes under the box while there is one, and the footer's typing
  and keys. **Health** is its Now, Battery and heat, and Apps groups, each a
  heading over a light grey box; **Jobs** is the phone's jobs; **History**
  is, under **Now**, its state, the accounts on it and any ban ("this belong
  in history"), then every account it has held and what happened to it.
  The tabs are 32px apart, as every underlined tab row is; a panel too
  narrow for all four scrolls the row sideways. Leaving
  Phone closes the screen, as leaving the panel does, so control goes off,
  and the ⋮'s Control row shows only on Phone. A new phone opens on Phone.
- **The header's buttons** (Hold or Release, the ⋮, the collapse button) sit
  one gap apart.
- **The ⋮** is tabs, as the profile's ⋮ is (Tyler, 12 Nov 2026: "Instead of
  toggle, put it as tabs instead with settings and control as the first
  tab"): **Settings**, **Setup** and **Actions**. Settings starts with
  Control, one row with the switch on its right, while the Phone tab shows
  (the screen stays on beside the open menu, so control is kept); then the
  phone's fields; then what can be asked of the phone: Open the bigger
  screen, **Read the version**, **Health check**, **Check the setup**, Copy
  link, Use as the self-test phone; then a line, **Wipe the phone** and
  Delete phone in red ("move these 2 function down here", of Actions' Read
  the version and Health check, then "move these 2 function as well", of
  Setup's Check now and Wipe the phone). The answers land in Actions and
  Setup; Wipe asks first. An iPhone's Check iCloud stays in Setup, beside the
  answer it reads. Every group in the tabs is a small heading over a light
  grey rounded box, never a card ("the settings should use this ui", then
  "not just settings, all toggles").
- **Settings** is rows (the phone's own details are at the bottom of the
  phone instead): a typed field (Shelf slot, SIM carrier and number, Tags) opens in a
  small box from its row and saves when it is left or Enter is pressed; a
  choice (Connection, Goes out through, Folder, Label) drops its list
  from the row and saves when picked. USB port and Last seen are read by the
  rack and can't be changed.
- **Setup**, **Health**, **Actions**, **Jobs** and **History** are the phone's
  window's old tabs ([making each phone look like one person's](looking-like-a-real-person.md),
  [a phone's health](phone-health.md), [a picture of every step](step-pictures.md),
  [seeing the rack](seeing-the-rack.md)). Step pictures show small and open
  full size when clicked. The health chart and figures fit the menu.
- **Deleting a phone** opens the one below it. Only the record goes: nothing
  on the phone changes, the accounts on it run on nothing until another place
  is picked, and a phone still plugged in comes back on the next check-in.

## A phone

- **What a phone holds:** a name, model, system version, serial number, SIM
  carrier and number, how it goes online, notes, a folder, a label, tags, a
  shelf slot, a USB port, and the rack it is on.
- **The rack it is on** is the rack that last saw it. Plugging a phone into
  another rack moves it there on that rack's next check-in, and its History
  says "Moved from Desk rack to Garage rack." A phone added by hand is on the
  rack it was added on, and a phone put on a rack with Put on a rack says so
  in its History too.
- **How it goes online:** its own SIM, or the house Wi-Fi. On Wi-Fi it goes
  out through one of the proxies in the Anti Detect dashboard's Proxies, and before every job
  the rack checks the address apps see is that proxy's
  ([making each phone look like one person's](looking-like-a-real-person.md)).
  A SIM phone never keeps a proxy. A proxy a browser profile uses is refused.
- **Folders, labels and tags are the browser profiles' own.** One folder can
  hold profiles and phones together.
- **Plugging a phone in adds it** to that rack. A serial the rack has never
  seen becomes a phone named after its model. A phone first seen before USB
  debugging was allowed is called "Phone" and the last four characters of its
  serial, and takes its model's name once the rack can read it.
- **Typing a serial** on a phone added by hand ties the record to the phone
  when it is plugged in later, instead of a second record being made.
- **What the rack fills in:** the model when it is blank, the system version
  every time, the USB port and when it was last seen. A name or model a person
  typed is kept.

## The status

Worked out from the rows every time the list is read, never stored, so it can
never disagree with what the rack last said.

- **Held:** a person took it out of use, with Hold, or has control of it on
  its screen ("In use on its screen"). It wins over everything else. Release
  puts it back. A check cannot be asked of a held phone, holding one cancels
  the checks still waiting for it, and its jobs wait until it is released.
- **Offline:** not seen for 45 seconds, missing from its rack's last list,
  waiting for someone to allow USB debugging on its screen, being restarted
  by the rack after it froze, on a rack that was disconnected, or never seen
  by a rack at all. The line under it says which. A phone put on a rack by
  hand and never plugged in is never called unplugged.
- **Busy:** a check is running on it.
- **Connected:** none of the above.

## A phone's address

`/admin/anti-detect?section=phones&open=<id>` opens the phone in Phones. Its
bell notices, its Copy link, and the Accounts and Bans screens link there. It
names no rack, so it stays right when the phone moves rack. A rack's own
notices, "Rack not checking in" and the iPhone tool's signature, open Phones
filtered to that rack; the pause notice opens Phones. The old `/admin/phones`,
`/admin/racks` and `/admin/racks/<id>` are gone since 13 Nov 2026
([Old addresses](../old-addresses.md)).

## The bell

A phone offline for five minutes, running hot, with no signal or nearly full,
and a rack not checking in, each ring the bell once and clear when they end.
[A phone's health](phone-health.md) has the rules.

## Where an account runs

An account runs on a browser profile or a phone, never both. The database
refuses the two at once (`ck_promo_accounts_one_device`), and one Reddit
account per phone is a unique index, the same rule as profiles.

- **Add account** on the Projects dashboard's Accounts has one "Runs on" list of
  profiles and phones with no Reddit account yet.
- **Runs on, in an account's ⋮,** moves it to another profile or
  phone. Whatever it ran on before is cleared in the same save.
- **Its jobs run on the phone.** [Jobs on phones](phone-jobs.md) explains the
  queue, the limit and the waking hours, and [Reddit on phones](../reddit/reddit-on-phones.md)
  what the Reddit app does there.
- **A phone an account left needs wiping** before another account goes on, and
  a phone that held an important account takes no throwaway until it is wiped.

## Where it is

- Phones: `src/components/anti-detect/phones-section.tsx`, drawing
  `rack-phones-panel.tsx` (the list) and `phone-panel.tsx` (the open phone)
  from `src/components/phones/`, with `new-phone-dropdown.tsx`,
  `phone-settings-section.tsx` and the `phone-*-panel.tsx` sections of the
  phone's ⋮. The list's filters are read by `src/lib/phones/rack-search.ts`
  and its rows by `src/lib/phones/rack-rows.ts`; the dashboard's address by
  `src/lib/anti-detect/search.ts`.
- The rack blocks and their windows: `src/components/anti-detect/rack-blocks.tsx`
  and `rack-settings-dialog.tsx`, with `new-rack-dialog.tsx`,
  `rack-pairing.tsx`, `rack-shelf.tsx`, `rack-log.tsx`, `rack-notes.tsx` and
  the `rack-note-*` files (a rack's "/" notes) in `src/components/phones/`.
- The endpoints: `src/lib/api/phones/phones.ts`, where `loadPhonesPage`
  reads every phone and rack at once. The server:
  `src/server/phones/rack.ts` (making, pairing, listing, deleting racks, and
  the check-in that moves a phone), `src/server/phones/phones.ts` (phones,
  `changePhone`, `putPhonesOnRack`) and `src/server/phones/saved-views.ts`
  (the views).
- The tables: `promo_racks`, `promo_rack_codes`, `promo_phones` and
  `promo_accounts.phone_id`, in `src/server/phones/schema.ts`.
  `drizzle/0139_promo_racks_dashboard.sql` adds the rack's description,
  banner, notes and creation date, ties a code to a rack, keeps finished
  actions when a rack is deleted, and turns the left menu's Phones link into
  Racks.
- The tests: `src/server/phones/racks.test.ts` and
  `src/components/phones/rack-page.test.tsx`.
