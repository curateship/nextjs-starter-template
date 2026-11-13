# Seeing the rack

Five ways to see what a rack is doing without opening phones one at a time,
all on the rack's page ([the Anti Detect dashboard's Phones](racks-dashboard.md)): a wall of
live pictures, the jobs on its phones, filters and a search box over its
phones, a map of its shelf, and the rack program's own log inside Promo. Ten phones read fine as a table. Twenty, with iPhones
and Androids on three networks, do not, and Tyler should never need a terminal
on the rack computer to find out why something failed.

Tyler's decisions, 18 Oct 2026: the wall refreshes each phone's picture every
5 seconds, and the rack map's rows and columns are typed in Settings → Phones.

## The wall

**Wall**, a tab on the rack's middle panel, shows one small picture of each of
that rack's connected phones. Another rack is never asked for pictures.

- **Every 5 seconds** the tab asks Promo for the newest picture of each
  phone, and the rack sends one picture per connected phone at that rate,
  270 pixels wide. Ten phones on the wall use about a tenth of the upload one
  open screen does.
- **A held or offline phone shows its status word** instead of a picture. A
  connected phone whose first picture has not arrived says so.
- **Nothing on the wall is tappable.** Clicking a phone opens it on the right,
  its screen showing, where control is off until it is switched on
  ([the screen](screen-window.md)).
- **Leaving the tab stops the pictures within ten seconds.** Asking is what
  keeps the rack sending, and the tab asks only while it is on screen: a
  hidden panel below 1280px, a shut one or another browser tab asks nothing.
- **A picture older than 30 seconds is not shown.** The rack sends one every
  5 seconds, so an older one means it stopped, and the tile says the phone is
  waiting for a picture rather than showing a stale screen as live.
- **Kept in the web server's memory**, never in the database, on a lane of
  its own so the wall's picture and a phone's own screen never mix.

## The Jobs tabs

A Jobs tab on the open phone answers "what is this phone doing" without
finding the project first, and a Jobs tab on the rack's middle panel lists
the same for every phone on the rack.

- **What it lists:** the jobs waiting for, running on and finished on the
  phone, or on the rack's phones, newest first, at most 100 finished ones. Each row says what the job does, the
  account it works as, the phone, and the project it is for.
- **Cancel and Try again are the Jobs window's own.** Cancelling here
  cancels the same job the Jobs window shows
  ([the Jobs window](../browser/jobs-dashboard.md)). Try again is offered
  only for jobs that read; a comment that failed is tried again from the
  Sent tab on the network's Commenting row.
- **It reads again every 10 seconds** while the tab is open, so a job queued
  for the phone's account shows within ten seconds.
- **A stopped browser program is said in red** on the tab, because phone jobs
  run in that same program and nothing starts on the phone without it.

## Filters and the search box

Filter on the rack's middle panel is the shell's popover. It filters by
status (Connected, Busy, Held, Offline), kind (Android, iPhone), carrier,
project, the apps that banned an account on it, wiping, folder, label and
tag, and groups by status or kind. Save as view keeps the filters as a view
of this rack, and the view picked shows in the moving rainbow edge on Views
([the Anti Detect dashboard's Phones](racks-dashboard.md)). The search box covers the name,
model, serial, carrier, number, notes, slot, tags and account handles.

- **Every filter lives in the address**, as `?status=offline`, `?kind=iphone`,
  `?carrier=Mint Mobile`, `?project=<id>`, `?wipe=needed`, `?banned=instagram`,
  `?folder=<id>`, `?label=<id>`, `?tag=…`, `?group=status` and `?q=8a`, so a
  link opens a filtered list. A filter replaces the address rather than
  stacking.
- **A filter's value never changes on its own.** A carrier or project in the
  address that no phone has stays as the picked option, showing no rows,
  rather than being dropped. Anything unusable in the address, such as a
  status Promo does not know, is left out.
- **The carriers listed are the ones seen on the rack's phones**, with what
  the SIM itself reported beating what was typed. The projects listed are the
  ones with an account on one of its phones.
- **Needs wiping** lists the phones an account left that need wiping before
  another account goes on ([making each phone look like one person's](looking-like-a-real-person.md)).
- **Banned on** lists the phones an app banned an account on, one pick per
  app ([Bans](../bans.md), part 4). Each row says "Banned on: Instagram
  twice" under its accounts.

## The shelf map

**Shelf**, a card on the rack's left panel, draws the shelf as a grid with
that rack's phones, so the right phone gets picked up first time.

- **Rows and columns come from Settings → Phones**, "The shelf", 1 to 20 each.
  Changing them redraws the map on the next page load.
- **Slots are numbered left to right, top to bottom.** With two rows of five,
  slot 7 is the second from the left on the lower row.
- **Each phone sits in the slot typed in its Settings**, with its status
  dot and its name, the status word read out for a screen reader. A slot is
  narrow, so a long name is cut short; pointing at it shows the whole name
  (Tyler, 6 Nov 2026: "show full name on hover"). An empty
  slot shows its number faintly; clicking it lists the phones with no slot,
  and picking one puts it there. Two phones typed into one slot both show.
- **A slot whose phone an app banned an account on** has a small ban mark
  in its corner, naming the apps on hover.
- **A phone with no slot, or a slot that is not on the shelf**, such as
  "12" on a shelf of ten or "top left", is listed under the grid with why.
- **Clicking a phone opens it on the right**, through `?open=<id>` like the
  rows do.
- **A shelf too wide for the panel** scrolls sideways inside the card.

## The rack's log

The **Log** card on the rack's left panel shows the program's own log, so a
failed action is read in Promo and never in a terminal on the Mac.

- **How the lines get here:** the card asks Promo, Promo tells the rack on its
  next ask for work (within about three seconds), and the rack posts the last
  300 lines of its `rack.log`, signed like every rack message. The card reads
  again every 3 seconds for up to 30 seconds and shows the lines, newest at
  the bottom, in a scrolling monospace box.
- **What it says meanwhile:** "The rack has not answered yet." while waiting,
  "The rack has not answered in 30 seconds. Press Refresh to ask again." after
  that, and "The rack is not checking in, so it cannot send its log." when the
  rack is not live, with Refresh switched off.
- **Refresh asks again.** New lines count as new against the time the rack
  sent them, never against this computer's clock.
- **Never streamed whole and never stored.** The lines wait in the web
  server's memory until the next answer replaces them, and an ask the rack
  does not answer within a minute is forgotten. A log search is out of scope.
- **The iPhone tool's signature** shows on the Rack program card as
  "WebDriverAgent signed until <date>" when the rack has reported one, in red
  with "which has passed" once the date is behind. The signing itself is the rack's own
  iPhone work ([the rack program](rack-program.md)).

## What the rack program sends and gets

Two shapes are the whole contract between Promo and the rack program for this
file.

- **The wall, on `/api/rack/screen`:** the answer gains `wall`, a list of the
  serials of this rack's connected phones while its Wall tab is open. Each frame
  the rack sends may carry `lane: "wall"` for a wall picture; a frame with no
  lane is a phone's own screen, as before.
- **The log, on `/api/rack/next` and `/api/rack/log`:** the answer to
  `/api/rack/next` gains `sendLog`, true once after the Log tab asked. The
  rack then posts `{ "lines": [...] }` to `/api/rack/log`, at most 300 lines
  of at most 2,000 characters each, oldest first.

## Where it is

- The wall: `src/components/phones/rack-wall.tsx`, its endpoint `loadWall` in
  `src/lib/api/phones/screen.ts`, the lane in `src/server/phones/screens.ts`
  (`wantWall`, by person and rack, `wallFrame`, the `wall` answer of
  `exchangeScreens`) and the frame's `lane` in `src/routes/api/rack/screen.ts`.
- The Jobs tabs: `src/components/phones/phone-jobs-panel.tsx`, `loadPhoneJobs`
  and `loadRackJobs` in `src/lib/api/phones/phones.ts`, and `listLaneJobs` in
  `src/server/social/job-list.ts`, which the Jobs window's list shares.
- The filters: `src/components/phones/rack-phones-panel.tsx`, read off the
  address by `src/lib/phones/rack-search.ts` and applied by
  `src/lib/phones/rack-rows.ts`; the projects come from
  `src/server/phones/phone-projects.ts`, the views from
  `src/server/phones/saved-views.ts`.
- The shelf map: `src/components/phones/rack-shelf.tsx` and the slot maths in
  `src/lib/phones/shelf.ts`; the shelf's size rides on the page from
  `readPhoneSettings`.
- The log: `src/components/phones/rack-log.tsx`, `askRackLog` and
  `loadRackLog` in `src/lib/api/phones/phones.ts`, the store
  `src/server/phones/rack-log.ts`, and the addresses
  `src/routes/api/rack/next.ts` and `src/routes/api/rack/log.ts`.
- The status dot's colours, shared by the rows, the wall and the shelf:
  `src/lib/phones/status-dot.ts`.
