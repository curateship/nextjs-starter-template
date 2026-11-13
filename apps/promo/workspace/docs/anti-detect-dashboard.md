# The Anti Detect dashboard

Browser profiles, Proxies, Racks and Bans as one three-panel dashboard, Racks becoming Phones at
`/admin/anti-detect`, reached from **Anti Detect** in the left menu. Tyler,
12 Nov 2026: "now comebine the 4 antidect dashboard into one 3 panel dashboard
like we did here", meaning [the Projects dashboard](projects-dashboard.md).
The task is `workspace/tasks/Anti Detect/anti-detect-dashboard.md`.

## Tyler's answers, 12 Nov 2026

- **Overview's widgets:** "Browsers and proxies, Racks, Bans in 30 days,
  Waiting on you".
- **The second block on the left page:** "Projects", narrowing every section
  to what one project's accounts use.
- **The cards that sat above the Bans table:** "Overview widgets".
- **The name:** "Anti Detect", one left-menu link in place of the four, and
  the menu's Anti Detect heading gone.

## The left menu

One link, **Anti Detect**, where Browser profiles, Proxies, Racks and Bans
were. `drizzle/0159_promo_anti_detect_dashboard.sql` changed every saved
left menu: the first of the four links in a section became Anti Detect, the
other three went, and a section left holding only Anti Detect lost its
heading, its link moving to the end of the section above.

## The frame

The Projects dashboard's: the shell's `ThreePanels`, `useCrmFrame` and record
frames, imported and never edited.

- **Left:** each person's own page of "/" blocks under a cover, stored in
  `promo_anti_detect_pages` (0159). Its header is the collapse button, "Anti
  Detect" and the ⋮: General (Cover photo, and Lock blocks at its foot) and
  Widgets. The first block follows Settings → Styling → Panel cards →
  Opacity.
- **Middle:** the section's list in one header and table shape, or
  Overview's widgets, which take the right panel's room too.
- **Right:** the row picked, carrying the left page's cover behind its
  header. A list's first row opens on arrival, so it is never empty unless
  the list is. Every record is drawn as the shell's are (Tyler, 12 Nov 2026:
  "the right panel is mostly not using ui standards. Look at how shell does
  it"): its body is grey `PanelCard`s of label-and-value rows, each folding
  and remembering it; what can be changed is in its ⋮ as grouped rows that
  save themselves, with no Save button; the footer has its main button.
- **The address** holds the section, the project, the filters and the open
  row (`src/lib/anti-detect/search.ts`). A first visit lands on Profiles. The
  bare address goes back to the last section and row, so every link names
  its section, Profiles too.

## The left page's blocks

- **Dashboards**, fixed: Overview (how many widgets show), Profiles, Proxies,
  Phones and Bans, each with its count. Its ⋮ hides a section or drags them
  into order, kept per person. It can't be deleted; its ⋮ moves it up or
  down.
- **The rack blocks**: Racks and Phones ([Phones](#phones)). A rack's
  program is the ⋮'s third tab, Rack program.
- **Projects**: every project, pinned first, with how many of the open
  section's rows its accounts use. Pressing one narrows every section, and
  pressing it again lets it go (`?project=`):
  - **Profiles:** the browser profiles its accounts sign in inside.
  - **Proxies:** the proxies those profiles, and its accounts' phones, go
    out through.
  - **Phones:** the phones its accounts are on.
  - **Bans:** its accounts' bans.
  - **Overview:** each widget the same way.

  What a project reaches is worked out from the accounts in use
  (`src/lib/anti-detect/project-reach.ts`).

## Overview

The person's own widgets in the shell's grid, starting with Waiting on you and
Bans in 30 days on top, Browsers and proxies and Racks under them.

- **Waiting on you:** each app the brake holds after two bans in a day, with
  **Release**, and each ban screen Promo did not know, with its picture, its
  line, and **It's a ban** or **Not a ban**. The account is stopped until it
  is answered. These were cards above the Bans table.
- **Bans in 30 days:** how many each app banned in the last 30 days, each
  opening Bans filtered to it, then each seller's bans out of how many were
  bought and the dollars lost, each opening that seller's bans.
- **Browsers and proxies:** every browser running now, every proxy whose last
  test failed, and what the proxies with a cost come to a month, the figure
  the old Proxies toolbar showed.
- **Racks:** each rack's phones online and the ones to look at, saying so when
  it is not checking in, each showing that rack's phones in Phones; then No
  rack.

## Profiles

Where the Browser profiles screen was ([the record](browser/profiles.md)).

- **The table:** Profile (with its label and folder), Proxy, Browser, Signed
  in, Last ran, dropping columns as the middle narrows. It reads itself again
  every two seconds while a browser opens, closes, is checked or backed up.
- **The header:** search, Select, Filter (Folder, Label, Tag), **New
  profile**; the ⋮ holds **Folders and labels**. Ticked rows move to a
  folder, take a label or a tag, or are deleted.
- **A row** opens the profile on the right. Its actions column opens the
  browser, or shows it while it runs, then the bin. Its right-click menu adds
  Stop the browser and Duplicate.
- **A profile on the right:** its name and the browser's state. Its ⋮
  holds Name and Notes, the proxy it goes out through, and its folder, label
  and tags, each saving itself, then Open or Show, Stop, Duplicate and
  Delete. The body's cards: Browser (its proxy, last test, the country it
  last went out from, when it last ran; a warning when the proxy is in
  another country; Restart for a browser still on its old proxy), Signed in,
  This profile's machine, What a site sees, Backups and History. The footer
  opens the browser, or shows it.
- **Windows** stay for the live browser, Folders and labels, and a new
  profile.

## Proxies

Where the Proxies screen was ([the proxies](browser/proxies-dashboard.md)).

- **The table:** Proxy (with its kind and any app it is banned on),
  Endpoint, Test, Used by, Outside address, Cost.
- **The header:** search, Select, Filter (Last test: working, failed or not
  tested; Kind), **New proxy**; the ⋮ holds **Paste in a list**. Ticked rows
  are tested or deleted.
- **A row** opens the proxy on the right, where a dead-proxy notice leads.
  Its actions column tests it, then the bin.
- **A proxy on the right:** its ⋮ holds its name, kind, protocol, host,
  port, username and password, a month's cost and the day it renews, each
  saving itself (the password row says "Stored", and only a typed password
  is sent), then Test it and Delete. The body's cards: How it is doing (the
  last test, endpoint, country, outside address, any app it is banned on),
  Used by, and What it costs. The footer has **Test now**. A save the server
  refuses, such as a host inside the network, says why and changes nothing.

## Phones

Where the Racks screen and each rack's own page were ([phones and
racks](phones/racks-dashboard.md)). Tyler, 12 Nov 2026: "I dont think a rack
needs its own dashboard. The racks dashboard should list all the phones and
the phones can just be filtered by rack tags. So rack name on the dashboard
can be renamed to \"Phones\" and in phones dashboard can be filtered by
racks".

- **The middle** is every phone on every rack, in the phones list a rack's
  page had: Phones, and Shelf, Wall, Jobs and Log while one rack is picked; Mass select,
  search, Filter, saved views, **New phone**, and a ⋮ with New rack, Pause or
  Resume every rack, and Self-test and app updates.
- **The rack** comes from the Racks block on the left page (`?rack=<id>`, or
  `?rack=none` for the phones on no rack), from any section.
- **The right panel** is the open phone with its live screen, as on a rack's
  page; while there is no picture, a phone drawn with Apple's logo or
  Android's robot in its middle.
- **The rack blocks** on the left page: Racks (New rack, a rack's settings,
  Disconnect, Delete in its ⋮), Phones (the counts by status and the jobs
  waiting), showing the rack picked or every rack together. A
  rack's Shelf and Log are tabs of the list, and its program the Rack
  program tab of the left page's ⋮.

## Bans

Where the Bans screen was ([bans](bans.md)).

- **The table:** Account, When, App, Kind (red when it counts, "Recorded, not
  counted" otherwise), Phone or profile, Proxy or SIM, Appeal, Since.
- **The header:** search, and Filter (App, Kind, Phone, Proxy, Seller, When:
  the last 7, 30 or 90 days). The project comes from the Projects block. No
  Select: nobody changes bans in bulk.
- **A ban on the right:** two cards. The account: its kind, when, the phone
  or profile, the proxy or SIM, its age then, its posts in the week before,
  the seller, the project, and what happened since. Then the ban card (the picture, the screen's
  words, the appeal, Clean up or Let it run again, the phone's last 20
  actions). **Open the account** at its foot goes to the account on the
  Projects dashboard.

## Old addresses

`/admin/profiles`, `/admin/proxies`, `/admin/bans`, `/admin/racks`,
`/admin/racks/<id>` and `/admin/phones` are gone since 13 Nov 2026. Bell
notices that held them now hold the section's address, keeping the open row
and the filters, and every link in Promo names the new address
([Old addresses](old-addresses.md)).

## Where the code is

- **Screens:** `src/components/anti-detect/` (the frame, the left page, the
  overview, one file per section, the profile and proxy records, the rack
  blocks with their windows, and a rack's settings window). Phones draws the
  phones list and the open phone from `src/components/phones/`, and the phone
  drawing is `phone-graphic.tsx` there.
- **Shared with the Projects dashboard:** `src/components/dashboard-page/`
  (the Dashboards and Projects blocks, the page panel, Filter's rows, and
  the right panels' rows).
- **The right panels' pieces:** `detail-rows.tsx` (a card's label-and-value
  rows, Promo's copy of the shell user panel's) and `text-pick-row.tsx` (a ⋮
  row holding one typed field that saves itself) in
  `src/components/dashboard-page/`. The New profile and New proxy windows
  keep their forms in `src/components/browser/profile-dialog.tsx` and
  `proxy-dialog.tsx`.
- **The address, the page and the widgets:** `src/lib/anti-detect/`.
- **The page's records:** `src/server/anti-detect/page.ts`, through
  `src/lib/api/anti-detect.ts`.
- **The route:** `src/routes/_authenticated/admin/anti-detect.tsx`, reading
  every section's rows at once so each Dashboards row has its count.
