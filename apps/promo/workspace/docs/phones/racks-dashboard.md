# The Racks dashboard and a rack's page

A rack is the computer the phones plug into, with the rack program on it.
Racks in the left menu, under **Anti Detect** after Proxies, opens the Racks
dashboard at `/admin/racks`: one row per rack. A row opens that rack's own
page at `/admin/racks/<id>`, with the rack on the left, its phones in the
middle, and the open phone with its live screen on the right.

Tyler's flow, 5 Nov 2026: "Rack dashboard > create rack > enter name,
discription > rack name (3 panel dashboard): left panel rack details, middle
phones (header create new phone), left panel phone detail and screen." On
6 Nov 2026 he picked Promo's project page as the drawing for the rack's page:
the back arrow, ⋮ menus that save as you go, and a banner with no avatar.

Tyler chose real phones for the important Reddit, Instagram and TikTok
accounts on 9 Oct 2026, with throwaway accounts staying on browser profiles.
His rule of 5 Oct 2026 holds here: devices are app-wide records with their own
dashboard, never something tucked into one network's settings.

## The Racks dashboard

- **Each row** is a rack: its name, the first words of its description, its
  phones online out of all of them ("1 of 2"), how many need a look, and
  whether it checks in. A rack's warnings count its phones that are offline,
  need wiping, or carry the amber setup line, and turn amber above none.
- **Whether it checks in** says "Checking in", "Not checking in, last seen 5
  minutes ago", "Waiting for the rack program" for a rack that never paired,
  or "Disconnected".
- **New rack** asks for a name and a description, then the same window shows
  the one-time code and the install command for that rack (below). Open the
  rack goes to its page at once; the code keeps working there.
- **Not on a rack** is one row while any phone has no rack: a phone typed in
  before a rack existed for it, or one left when its rack was deleted. It
  opens a window where each phone has Put on a rack. `?loose=1` opens it.
- **The search box** covers the racks and every phone by name, serial, model
  or account, so a phone is one search away wherever it sits. Phones that
  match list under a Phones heading, and each opens on its own rack.
- **Pause every rack** and **Self-test** sit here, because each is one switch
  for every rack, not one per rack ([the self-test and app updates](self-test-and-app-updates.md)).
- **Delete** takes a rack that is not connected: one that never paired, or
  one that was disconnected. A connected rack is kept, with why. Its phones
  move to Not on a rack and keep their history, readings and finished
  actions; its bell notices go with it.
- The list reads again every 10 seconds while it is in view.

## Making a rack and pairing it

A rack is made by a person first and the program joins it, rather than the
program making the rack when it pairs (`drizzle/0139_promo_racks_dashboard.sql`).

- **A code belongs to one rack.** It is made on that rack's page, or by the
  New rack window, works once, for 15 minutes, and its card counts the
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

## A rack's page

The shell's three-column frame. The first phone opens on arrival, and the
page goes back to where it was, one place per rack, so another rack's filters
never follow you. Below 1280px one panel shows at a time, with the pills
Phones, Rack and Phone. The page reads again every 10 seconds while it is in
view, and the open phone follows the same read.

While Pause is on, a line across the top of every rack's page says "All phone
jobs are paused, on every rack", with Resume.

A link to a rack that is gone says "That rack is not there any more", with a
way back to Racks.

### The left panel: the rack

- **The header** is the back arrow to Racks, the rack's name with its check-in
  dot, the notes icon and the ⋮.
- **The ⋮** holds Name and Banner as folding rows, each saving itself, then
  Disconnect this rack for a connected rack, or Delete rack in red for one
  that is not. It opens to the right, over the phones.
- **The banner** is a picture from the media library lying faintly behind the
  top of the panel. There is no avatar (Tyler, 5 Nov 2026: "NO avatar just
  banner cover").
- **The description** is written in place in the shell's editor and saves
  itself 700ms after the last letter, with Saving… and Saved in the page
  header.
- **Phones** counts the rack's phones as connected, busy, held and offline,
  and the jobs waiting for them. A status's number filters the list to it;
  pressing it again takes the filter away. Jobs waiting opens the Jobs tab.
- **Rack program** says whether it checks in, the computer, the program's
  version, when it paired, the iPhone tool's signature date (red once it has
  passed), and what its last update did. A rack that never paired, or was
  disconnected, shows how to install it instead, with a code for this rack.
- **Shelf** draws the shelf by slot ([seeing the rack](seeing-the-rack.md)).
  Clicking a phone opens it; clicking an empty slot lists the phones with no
  slot, and picking one puts it there. A shelf too wide for the panel scrolls
  sideways inside the card.
- **Mix** counts this rack's phones on each model, carrier and system version,
  with the warning when more than half of four or more share one
  ([making each phone look like one person's](looking-like-a-real-person.md)).
- **Log** shows the rack program's own last lines
  ([seeing the rack](seeing-the-rack.md)).
- **The notes icon** swaps the body for the rack's notes, below.

### The rack's notes

The shell's editor with "/" blocks copied from Project (Tyler, 5 Nov 2026:
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

The notes save themselves like the description. Project's Task card, File,
Video-or-Promo and Web page blocks are left out, because a rack has none of
those. Checklist is left out too, because it needs Tiptap's list extension,
which Promo does not carry. The rules for what notes may hold are in
`src/lib/phones/rack-notes.ts`, checked in the editor and on the server.

### The middle panel: the rack's phones

- **Tabs**: Phones with its count, Wall and Jobs. Wall is the rack's live
  pictures and Jobs every job on its phones ([seeing the rack](seeing-the-rack.md)),
  in the shell's table: the job, the account, the status, when, and Cancel or
  Try again (Tyler, 6 Nov 2026: "jobs tab should have normal tables").
- **The toolbar**, in the UI standard's order: "N selected" while phones are
  ticked, Mass select, the search, Filter, Views and New phone.
- **Filter** is the shell's popover: Status, Kind, Carrier, Project, Banned
  on, Wiping, Folder, Label and Tag, then Group (by status or by kind), then
  Clear and Save as view. **Views** lists the views saved here, and the one
  picked shows its name in the moving rainbow edge in place of "Views" (Tyler,
  5 Nov 2026: "Use the ui standard filter and save filter feature with saved
  filter rainbow button"). A view is per person and per rack.
- **Every filter lives in the address**, as `?status=offline&kind=iphone`, so
  a link opens the same list. A value no phone has stays picked rather than
  being dropped.
- **Mass select** shows tick boxes; the "N selected" menu holds Hold, Release,
  Move to folder, Set label and Add tag, each one request.
- **The rows** sort by shelf slot, so the list reads like the shelf: the slot,
  then the phone with its model, system version, folder, tags, accounts, app
  versions, "Self-test phone", the amber setup line and "Banned on", its
  status, carrier and when the rack last saw it. The columns fold by the
  panel's own width, not the window's: under 768px of panel the account moves
  under the name and the carrier goes; last seen shows from 1024px.
- **New phone** is a dropdown, not a window: the name, then the serial and
  kind, then the shelf slot and how it goes online, with Create phone. The
  phone is made on this rack and opens on the right. The serial is
  checked as it is typed, and one another phone has says so before Create.

### The right panel: the open phone

- **The header** is the phone's name and status, Hold or Release, and the ⋮.
  There is no ×.
- **Under the header is the live screen, always** ([the screen](screen-window.md)):
  the picture, then the grey Control and Sign-in codes cards, the side
  panel's own card (Tyler, 6 Nov 2026: "control and signin codes card does
  not use standard gray card"). There are no tabs.
- **Everything else is in the ⋮** (Tyler, 6 Nov 2026: "All these options
  should go into the 3 vertical dots dropdown"). Settings, Setup, Health,
  Actions, Jobs and History are folding rows, each saying where it stands on
  the right (the model, "Checked", the battery); then a line, Open the bigger
  screen, Copy link, Use as the self-test phone, and Delete phone in red. A
  row's body is drawn only while it is open, so a shut row reads nothing, and
  the screen stays on beside an open menu, so control is kept while a setting
  is changed. Every card in them is the grey side-panel card, and everything
  fits the menu's 294px: the Jobs table folds to the job and its button.
- **Settings** holds the phone's fields, each saving itself 700ms after the
  last letter, when it is left, or the moment a pick changes. There is no Save
  button. Only the field that changed is sent, so a save never writes back an
  older copy of what the rack fills in. The USB port and last seen are the
  rack's, shown as words.
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
  rack it was added on, and a phone put on a rack from Not on a rack says so
  in its History too.
- **How it goes online:** its own SIM, or the house Wi-Fi. On Wi-Fi it goes
  out through one of the proxies on the Proxies dashboard, and before every job
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

## The one address that opens a phone

`/admin/phones?open=<id>` lands on the page of the rack the phone is on, with
the phone open. Its bell notices and the Accounts, Bans and Reddit accounts
dashboards link there, so a link stays right when the phone moves rack. A
phone on no rack opens Not on a rack, and the bare `/admin/phones` goes to the
Racks dashboard. A rack's own notices, "Rack not checking in" and the iPhone
tool's signature, open that rack's page; the pause notice opens Racks.

## The bell

A phone offline for five minutes, running hot, with no signal or nearly full,
and a rack not checking in, each ring the bell once and clear when they end.
[A phone's health](phone-health.md) has the rules.

## Where an account runs

An account runs on a browser profile or a phone, never both. The database
refuses the two at once (`ck_promo_accounts_one_device`), and one Reddit
account per phone is a unique index, the same rule as profiles.

- **Add account** on the Accounts dashboard has one "Runs on" list of
  profiles and phones with no Reddit account yet.
- **The settings button on an account's row** moves it to another profile or
  phone. Whatever it ran on before is cleared in the same save.
- **Its jobs run on the phone.** [Jobs on phones](phone-jobs.md) explains the
  queue, the limit and the waking hours, and [Reddit on phones](../reddit/reddit-on-phones.md)
  what the Reddit app does there.
- **A phone an account left needs wiping** before another account goes on, and
  a phone that held an important account takes no throwaway until it is wiped.

## Where it is

- The Racks dashboard: `src/components/phones/racks-dashboard.tsx`, with
  `new-rack-dialog.tsx`, `rack-pairing.tsx` and `loose-phones-dialog.tsx`. The
  route is `src/routes/_authenticated/admin/racks.tsx`.
- A rack's page: `rack-workspace.tsx` on the shell's `ThreePanels`, with
  `rack-panel.tsx` (the left panel), `rack-notes.tsx` and the `rack-note-*`
  files (the "/" blocks), `rack-shelf.tsx`, `rack-log.tsx`,
  `rack-phones-panel.tsx` and `new-phone-dropdown.tsx` (the middle),
  `phone-panel.tsx`, `phone-settings-section.tsx` and the `phone-*-panel.tsx`
  sections of its ⋮ (the right). The route is
  `src/routes/_authenticated/admin/racks_.$rackId.tsx`; the address is read by
  `src/lib/phones/rack-search.ts`, the rows by `src/lib/phones/rack-rows.ts`,
  and the layout and place keys are in `src/lib/phones/panel-keys.ts`.
- The phone address: `src/routes/_authenticated/admin/phones.tsx`.
- The endpoints: `src/lib/api/phones/phones.ts`. The server:
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
