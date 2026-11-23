# Trips and the trip page

## Tyler's rules

These are Tyler's answers of 2 Nov 2026, in his words where he gave words.
They outrank the code.

- **The flow:** "create trip in table dashboard > trip > 3 panel dashboard > left panel trip details, middle panel schedule with board view as default. Col 1 is day 1, col 2 is day 2 etc.. and each day cards is activities for each day, clicking on the card opens up the activity details on right panel."
- **Copy Project:** "copy the Ui from the project app 3 panel dashboard."
- **Who uses it:** anyone who signs up, and each person sees only their own trips.
- **Maps:** Google Maps, for addresses, opening hours and travel times.
- **Money:** one currency per trip, picked when the trip is made.
- **A new trip** needs a name and a number of days. Dates are optional and can be added later.
- **A card shows everything:** the photo, title, start time, type icon, cost and the Booked or To book mark.
- **Activity types:** each person edits their own list in Settings → App settings.
- **Pricing:** free for now.
- **Sample trip:** Tokyo, 5 days.
- **Pictures:** "Add unsplash for images for activities and cover photo."
- **The Trips dashboard is one three-panel design** (Tyler, 12 Nov 2026: "We
  need to consolidate and reorganize the trips dashboard. It needs to be one
  cohesive 3 panel design"). This replaced his rule of 6 Nov 2026 that the
  Trips table stays a table. Its rules are in
  [The Trips dashboard](trips-dashboard.md).

## Who sees a trip

- **A trip belongs to the one person who made it.** Every server call checks
  the signed-in account owns the trip (`requireTrip` in
  `src/server/travel/access.ts`). The check is the account alone, not the
  site, so a person's trips are the same whichever site they sign in through.
- **Someone else's trip answers like one that doesn't exist:** "That trip
  doesn't exist or you can't see it." An id can't be used to learn a trip is
  there.

## The Trips dashboard

`/trips` is the Trips dashboard: Overview's widgets, the Trips table and
Places, picked from the Dashboards block in its left panel. Its tabs, the Bin,
New trip and Copy trip are in [The Trips dashboard](trips-dashboard.md).

## The time zone of a new trip

Tyler, 6 Nov 2026: "New trip + destination change".

- **New trip fills it in** from the destination. Open-Meteo's free place
  search, which the weather already uses, gives each place its time zone, so
  "Tokyo" becomes Asia/Tokyo. It happens after the trip is saved, so a slow or
  failed search never stops the trip being made.
- **A new destination changes it too**, in Trip settings → Destination, but
  only while the time zone is still the one Travel filled in, or is empty.
- **A time zone picked in Trip settings → Time zone is never changed.**
  `travel_trips.time_zone_guessed` remembers which kind it is
  (`drizzle/0105_travel_time_zone_guessed.sql`). The sample trip's Asia/Tokyo
  counts as filled in.
- **A country with several time zones**, such as "USA", gets Open-Meteo's
  first answer. A destination it can't place leaves the time zone as it was.
- The time zone decides Today on the board, the phone calendar's times and
  which hour the rain at a card's hour reads from.
- The code is `guessTripTimeZone` in `src/server/travel/trip-time-zone.ts`,
  called by the New trip and Trip settings endpoints in
  `src/lib/api/travel/trips.ts`.

## The Year widget

The year as bars, one per dated trip, is Overview's Year widget on the Trips
dashboard ([The Trips dashboard](trips-dashboard.md)). It was the Trips
table's Year tab, from Tyler's "Cover, name, dates" of 6 Nov 2026, until
12 Nov 2026.

- **A short trip's name carries on past its bar,** so bars take a new row
  whenever the next trip starts within about six weeks of one already on that
  row.
- **It opens on the year of the next trip** that hasn't ended, or this year.
- **A trip over New Year** shows in both years, cut at the edge.
- **On a phone** the months keep a 720px width and scroll sideways.
- The code is `TripsYearView` in `src/components/travel/trips-year-view.tsx`
  and `yearBars` in `src/lib/travel/trip-year.ts`.

## Opening on the trip that's on now

Tyler, 6 Nov 2026: "On sign-in and Home", then "Travel-only address".

- **`/trips/today`** opens the trip that's on today, which opens on today's
  column, or the Trips table when no trip is on. A trip is on when today,
  where the trip is, is one of its days. With two on at once, the one that
  started last wins. Archived trips and trips in the Bin don't count.
- **To make it where members land**, an admin types `/trips/today` in
  Settings → General → member home route. Signing in and opening Home then
  go there. With no trip on, members land on the Trips table, not Home's plan
  and feedback page. Admins keep their own home route.
- **Trips in the left menu still opens the table.**
- It only forwards, replacing itself in the browser's history, so Back never
  lands on it.
- Nothing changed in the shell's Home: the address is Travel's own route,
  `src/routes/_authenticated/trips/today.tsx`, and the lookup is
  `findTripOnToday` in `src/server/travel/trip-today.ts`.

## The cover photo

A new trip gets its cover by itself (Tyler, 3 Nov 2026: "Always, by
itself"). Create trip searches Unsplash for the destination and takes the
top photo, with the credit Unsplash asks for. Unsplash is told the photo was
used before it is set, as its rules ask, the same as picking one by hand. The
cover changes in Trip settings → Cover photo as usual.

- **No cover** when the trip has no destination, there's no
  `UNSPLASH_ACCESS_KEY`, Unsplash finds nothing, or it doesn't answer. The
  trip is always made; a failed search never stops it.
- **Copy trip** keeps the cover of the trip it copied, and the sample trip
  has none.
- **At most 30 covers in 10 minutes** per person, since Unsplash allows few
  searches an hour. A trip past that is made with no cover.
- The code is `src/server/travel/trip-cover.ts`, run by the New trip
  endpoint in `src/lib/api/travel/trips.ts`.

## The sample trip

A person's first visit to Trips makes "Tokyo, 5 days" (Tyler, 2 Nov 2026):
flights in and out, a 3-night hotel, temples, food, a Nikko day trip, the
Ghibli Museum in Ideas and a short description, in yen, starting 30 days
after the day it was made. It is given once, ever:
`travel_sample_given` remembers, so deleting it means it never comes back.

## The trip page

- **At `/trips/<id>`**, on the shell's shared three-column layout
  (`src/components/shared/three-panels.tsx`), the same one Contacts uses.
- **Left panel:** the trip itself ([The trip's left panel](the-trip-panel.md)).
- **Middle panel:** the schedule ([The day board](the-day-board.md)). Board
  is the first view. Its columns are Ideas, then Day 1, Day 2 and so on, one
  per day of the trip. Each column's "+" opens New activity already set to
  that day, and the header's "+ Add" → New activity opens the same dropdown
  set to Day 1.
- **Right panel:** the open activity ([Activities](activities.md)). The bin
  icon moves it to the trip's bin.
- **The open activity is in the address**, `?open=<id>`, so a reload or a
  pasted link opens the same one. On arrival with nothing open, the first
  activity of Day 1 opens (Ideas count last), so the right panel is never
  empty. A trip with no activities says how to add one.
- **`?note=<id>` opens with that note showing** in the left panel, as a
  pinned note pressed on the Trips dashboard does. The address lets it go
  once it is shown, so a reload keeps the description.
- **The page remembers where it was** per trip, in this browser: arriving at
  the bare address puts back the open activity and the view.
- **Rate the trip** is in the trip's ⋮ menu, after the line, and opens from
  nowhere else (Tyler, 5 Nov 2026: "Only from the menu"). It walks through
  every card marked Done that has no rating yet, one at a time in the board's
  order with Ideas last: its picture, name and day, 1 to 5 stars and Would go
  again, each saved as it's picked, then Next (Skip before rating) and Back.
  The walk is the cards unrated when it opened, so Back reaches a card just
  rated. With none left it says every Done card already has a rating
  (`src/components/travel/rate-trip-dialog.tsx`).
- **Opening an activity doesn't reload the trip.** The route's loader ignores
  the address's search, so only a saved change reloads it.

## The left menu

A background job adds a Travel section with Trips to the members' menu and
each workspace's menu, once each, and writes down that it did in
`travel_navigation_added` (`src/server/travel/navigation.ts`, copied from
Project's). An admin who removes the link in Settings keeps it removed.

## Where it lives

- **Tables:** `drizzle/0098_travel_trip_planner.sql`, described to the query
  builder in `src/server/travel/schema.ts`. All of Travel's tables are in that
  one file: trips, activities, activity types, files, checklist items, journal
  entries, saved places, Google travel times, the sample trip marker and the
  menu marker.
- **Server code:** `src/server/travel/`. Endpoints: `src/lib/api/travel/`.
- **Screens:** `src/components/travel/`, routes in `src/routes/_authenticated/trips/`.
- **Remembered layout keys:** `src/lib/travel/panel-keys.ts`, Travel's own,
  because the shell's key list is a shell file.
