# The Events dashboard

Admin → Events, at `/admin/events`, is one three-panel dashboard laid out
piece for piece as the Listings dashboard is (`listings-dashboard.md`). It
was a table page whose rows opened a window. Task events/37, Part 1, built 19
Nov 2026 from its mock (https://claude.ai/artifact/ChvFLrR1QtKFYuJ1u8XgzU).

- **Where the code is:** `src/components/events/events-dashboard/`. The frame
  is `events-dashboard.tsx`, each row is a file in `sections/`, and the event
  on the right is `event-record.tsx`.
- **The address:** `src/lib/events/events-dashboard-search.ts`. Events is the
  row with no `section`. The open event is `?open=`, so every link made to
  the old Events page still opens its event.
- **The left page's table:** `directory_event_pages`, one row per site, from
  `drizzle/0157_cms_event_pages.sql`, owed on live until the next deploy runs
  it.

## The rows

The Dashboards block lists them in this order (Tyler, 19 Nov 2026: "Overview
widgets, Sign-ups, Featured events", besides Events itself):

- **Overview:** widgets, no right panel. Coming up this week, Sign-ups this
  week and Waiting suggestions on top; Most viewed in 30 days and Filling up
  under them. Its pill counts the widgets shown.
- **Events:** every event, a repeating one once, behind Upcoming, Past and
  Draft tabs in the header, each with its count. Upcoming is published and
  not over; a repeating event stays there while any date is still to come.
  Search, Select (Set a category, Publish, Unpublish, Feature, Stop
  featuring, Delete), Filter (the Views range, and a category picked on the
  left) and New event. Each row has Duplicate, the cog and the bin, and a
  right-click menu of Mass select, Duplicate and Delete. Its pill counts every
  event.
- **Sign-ups:** everyone signed up across the site's events, newest first,
  with the event each is for. Filter shows who is coming (the default and the
  pill's count), who is waiting for a seat, or everyone. A row opens its event
  on the right. The bin, right-click and Select take people off their list,
  the same as the bin in the Sign-ups tab of an event's ⋮.
- **Featured events:** every event featured now, by an admin's free switch or
  by a spot a listing's owner paid for, with how, until when and what was
  paid. A repeating event counts as running while any of its dates is still
  to come. Search finds them by title, and Filter shows ended spots too. A row opens its event under a Featured
  spot card. "Stop featuring" switches an admin's off, or revokes a paid spot
  with no refund. Its pill counts the spots running now.
- **Custom fields:** the site's own event fields, the sections of them in
  the order they sit on an event's page. It is the Listings dashboard's
  Custom fields row with the events' own list (task events/07; Tyler, 19 Nov
  2026: "Own row on Events"). It comes last so the four rows above keep
  Tyler's order. Its pill counts every event section. `events.md` says what
  the fields do.
- **Event submissions stays where it was,** at `/admin/event-submissions`.
  Tyler left "Suggested events" out of the rows.
- **Hiding and moving rows:** the Dashboards block's ⋮ hides any row but
  Overview and drags them into order, saved with the site's page.

## The left page

The site's own page of blocks, saved 700ms after typing stops, under a cover
photo when one is set. Every admin of the site shares it. Its ⋮ holds General
(cover photo, Lock the notes) and Widgets (Overview's rows and spots). The +
in its header is New event.

- **Dashboards block:** fixed. The editor refuses to delete it, and the
  server puts it back at the top of a page saved without it.
- **Coming up block:** the next five published events, a repeat's dates each
  on their own, soonest first, each opening on the right. It stands where
  the Listings dashboard has Needs you.
- **Categories block:** the categories events are filed under, biggest
  first. Pressing one narrows the Events row to it; pressing it again lets it
  go.

## The event on the right

`event-record.tsx`, in the shell's record frame. It saves itself 700ms after
the last change, with "Saved" or what is missing in its footer beside
Publish or Unpublish. The panel itself shows only Body, under a featured
spot's card when the Featured events row opened it. Everything else is in its
header's ⋮ (Tyler, 19 Nov 2026: "Move all these blocks into the right panel
header 3 dot dropdown"). Body's editor has no box of its own: the text and
the Listing card button under it run to the card's edges (Tyler, 20 Nov 2026:
"remove the container so the editor is edge to edge", then "add the listing
card button below the editor"). The post window keeps its boxed editor, with
the button above the text. `events.md` says what each field does.

- **General tab:** three grey lists of rows, then Duplicate and Delete when the
  Events row opened it.
  - **The event:** Title, Address part, Summary, Cover image, Tickets link and
    Categories. Each row shows its value and opens a small box with its field.
  - **When and where:** Start day and End day open the month straight away.
    Start time, End time, Place (the place, its street address, or a listing
    picked as the place) and Repeat open a box. On one date of a repeat, the
    Repeat row says whose date it is and has Open main event.
  - **The site's own event fields:** one list per section, named after it,
    between When and where and Publishing. Each row shows the answer and
    opens the field.
  - **Publishing:** Status, Schedule (Scheduled, Postponed or Cancelled,
    each asking first; `events.md` has "Cancelled or postponed"), Who can find
    it, and the Featured switch on a main event.
- **Sign-ups tab:** the switch, seats, closing time, question, who is coming
  and who is waiting.
- **Later dates tab:** only on a main event that repeats. Pressing a date opens
  it on the right.
- **No Save button and no window.** A seat count or tickets link the server
  would refuse holds the save and says why in the footer.
- **Opening another event saves first.** A later date, its main event, or
  another row all save what was typed before the record changes.

## Where it lives

- `src/server/events/events-dashboard.ts`: the page, the counts, Coming up,
  the categories, Overview's figures, and the Sign-ups and Featured events
  reads. `listEvents` in `src/server/events/events.ts` holds the tabs.
- `src/lib/api/events/events-dashboard.ts`: the doors, every one admin only
  and the site's own.
- `src/lib/events/events-dashboard-page.ts`: the page's blocks and Overview's
  widgets. `src/lib/events/events-panel-keys.ts`: what this browser
  remembers.
- `src/server/events/events-dashboard.test.ts`: the tabs, counts, Coming up,
  the Sign-ups and Featured events rows and the page.
