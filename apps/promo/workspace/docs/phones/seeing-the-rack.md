# Seeing the rack

Five ways to see what the rack is doing without opening phones one at a time:
a wall of live pictures, a Jobs tab on each phone's window, filters and a
search box on the Phones dashboard, a map of the shelf, and the rack program's
own log inside Promo. Ten phones read fine as a table. Twenty, with iPhones
and Androids on three networks, do not, and Tyler should never need a terminal
on the rack computer to find out why something failed.

Tyler's decisions, 18 Oct 2026: the wall refreshes each phone's picture every
5 seconds, and the rack map's rows and columns are typed in Settings → Phones.

## The wall

**Wall** in the Phones dashboard toolbar opens a window with one small
picture of every connected phone.

- **Every 5 seconds** the wall asks Promo for the newest picture of each
  phone, and the rack sends one picture per connected phone at that rate,
  270 pixels wide. Ten phones on the wall use about a tenth of the upload one
  open screen window does.
- **A held or offline phone shows its status word** instead of a picture. A
  connected phone whose first picture has not arrived says so.
- **Nothing on the wall is tappable.** Clicking a phone closes the wall and
  opens its screen window, where control is off until it is switched on
  ([the screen window](screen-window.md)).
- **Closing the wall stops the pictures within ten seconds.** Asking is what
  keeps the rack sending; the wall sends no message of its own when it
  closes, the same rule as a screen window.
- **A picture older than 30 seconds is not shown.** The rack sends one every
  5 seconds, so an older one means it stopped, and the tile says the phone is
  waiting for a picture rather than showing a stale screen as live.
- **Kept in the web server's memory**, never in the database, on a lane of
  its own so the wall's picture and a screen window's never mix.

## The Jobs tab on a phone

A sixth tab on a phone's window, after Actions, answers "what is this phone
doing" without finding the project first.

- **What it lists:** the jobs waiting for, running on and finished on this
  phone, newest first, at most 100. Each row says what the job does, the
  account it works as, the phone, and the project it is for.
- **Cancel and Try again are the Jobs window's own.** Cancelling here
  cancels the same job the Jobs window shows
  ([the Jobs window](../browser/jobs-dashboard.md)). Try again is offered
  only for jobs that read; a comment that failed is tried again from the
  Comments tab.
- **It reads again every 10 seconds** while the tab is open, so a job queued
  for the phone's account shows within ten seconds.
- **A stopped browser program is said in red** on the tab, because phone jobs
  run in that same program and nothing starts on the phone without it.

## Filters and the search box

The toolbar filters by status (Connected, Busy, Held, Offline), kind (Android,
iPhone), carrier, project and wiping, beside the folder, label and tag filters
the Browser profiles dashboard has too, and the search box covers the name,
model, serial, carrier, number, notes, slot, tags and account handles.

- **Every filter lives in the address**, as `?status=offline`, `?kind=iphone`,
  `?carrier=Mint Mobile`, `?project=<id>`, `?wipe=needed` and `?q=8a`, so a
  link can open a filtered list and the back button undoes a filter. Picking
  a filter is its own history entry; typing goes into the address 300
  milliseconds after the last letter, replacing rather than stacking.
- **A filter's value never changes on its own.** A carrier or project in the
  address that no phone has stays as the picked option, showing no rows,
  rather than being dropped. Anything unusable in the address, such as a
  status Promo does not know, is left out.
- **The carriers listed are the ones seen on the phones**, with what the SIM
  itself reported beating what was typed. The projects listed are the ones
  with an account on a phone.
- **Needs wiping** lists the phones an account left that need wiping before
  another account goes on ([making each phone look like one person's](looking-like-a-real-person.md)).
- **On a phone-sized window the filters fold away**, like the folder, label
  and tag filters, so the search box keeps its room; a filter in the address
  still applies.

## The rack map

**Map** in the toolbar draws the shelf as a grid, so the right phone gets
picked up first time.

- **Rows and columns come from Settings → Phones**, "The shelf", 1 to 20 each.
  Changing them redraws the map on the next page load.
- **Slots are numbered left to right, top to bottom.** With two rows of five,
  slot 7 is the second from the left on the lower row.
- **Each phone sits in the slot typed on its window**, with its status dot,
  the status word beside the colour, and its name. An empty slot shows its
  number faintly. Two phones typed into one slot both show there.
- **A phone with no slot, or a slot that is not on the shelf**, such as
  "12" on a shelf of ten or "top left", is listed under the grid with why.
- **Clicking a phone opens its window**, through `?open=<id>` like the rows
  do. Editing a phone from the map is out of scope.

## The rack's log

Each rack's card in the Rack window has a **Log** tab, so a failed action is
read in Promo and never in a terminal on the Mac.

- **How the lines get here:** the tab asks Promo, Promo tells the rack on its
  next ask for work (within about three seconds), and the rack posts the last
  300 lines of its `rack.log`, signed like every rack message. The tab reads
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
- **The iPhone tool's signature** shows on the rack's card as "WebDriverAgent
  signed until <date>" when the rack has reported one, in red with "which has
  passed" once the date is behind. The signing itself is the rack's own
  iPhone work ([the rack program](rack-program.md)).

## What the rack program sends and gets

Two shapes are the whole contract between Promo and the rack program for this
file.

- **The wall, on `/api/rack/screen`:** the answer gains `wall`, a list of the
  serials of the connected phones whose owner has the wall open. Each frame
  the rack sends may carry `lane: "wall"` for a wall picture; a frame with no
  lane is the screen window's, as before.
- **The log, on `/api/rack/next` and `/api/rack/log`:** the answer to
  `/api/rack/next` gains `sendLog`, true once after the Log tab asked. The
  rack then posts `{ "lines": [...] }` to `/api/rack/log`, at most 300 lines
  of at most 2,000 characters each, oldest first.

## Where it is

- The wall: `src/components/phones/phone-wall-dialog.tsx`, its endpoint
  `loadWall` in `src/lib/api/phones/screen.ts`, the lane in
  `src/server/phones/screens.ts` (`wantWall`, `wallFrame`, the `wall` answer
  of `exchangeScreens`) and the frame's `lane` in `src/routes/api/rack/screen.ts`.
- The Jobs tab: `src/components/phones/phone-jobs-panel.tsx`, `loadPhoneJobs`
  in `src/lib/api/phones/phones.ts`, and `listLaneJobs` in
  `src/server/social/job-list.ts`, which the Jobs window's list shares.
- The filters: `src/lib/phones/phones-search.ts` reads them off the address
  for `src/routes/_authenticated/admin/phones.tsx`; the projects come from
  `src/server/phones/phone-projects.ts`.
- The map: `src/components/phones/rack-map-dialog.tsx` and the slot maths in
  `src/lib/phones/shelf.ts`; the shelf's size rides on the page from
  `readPhoneSettings`.
- The log: `src/components/phones/rack-dialog.tsx`, `askRackLog` and
  `loadRackLog` in `src/lib/api/phones/phones.ts`, the store
  `src/server/phones/rack-log.ts`, and the addresses
  `src/routes/api/rack/next.ts` and `src/routes/api/rack/log.ts`.
- The status dot's colours, shared by the rows, the wall and the map:
  `src/lib/phones/status-dot.ts`.
