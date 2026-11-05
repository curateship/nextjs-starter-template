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

## Who sees a trip

- **A trip belongs to the one person who made it.** Every server call checks
  the signed-in account owns the trip (`requireTrip` in
  `src/server/travel/access.ts`). The check is the account alone, not the
  site, so a person's trips are the same whichever site they sign in through.
- **Someone else's trip answers like one that doesn't exist:** "That trip
  doesn't exist or you can't see it." An id can't be used to learn a trip is
  there.

## The Trips table

- **At `/trips`**, reached from Trips in the left menu's Travel section.
- **The map of places visited** sits above the table. Hide map takes it away,
  and Show map in the toolbar brings it back; the choice is remembered in this
  browser. It needs `GOOGLE_MAPS_BROWSER_KEY` ([Outside services](outside-services.md)).
  A switch at its top left picks what it pins, also remembered in this
  browser:
  - **Destinations:** a pin per trip's destination, which opens the trip.
  - **Places I've been** (Tyler, 5 Nov 2026: "Small card on the map"): a pin
    for every card marked Done that has a place on the map, on every trip not
    in the Bin, up to 2,000. Clicking one shows a small card at the map's
    bottom left with the place, its trip and its rating, and Open trip, which
    opens that card on that trip. Many pins close together aren't grouped yet,
    so a lot of them make a busy map. The pins are `loadVisitedPins` in
    `src/server/travel/trip-admin.ts`.
- **Tabs:** Upcoming (every trip that hasn't ended, trips with no dates
  included), Past, Archived and Bin, kept in the address as `?show=past`,
  `?show=archived` or `?show=bin`.
- **Columns:** Trip (the cover photo, name, destination and tags), Dates with
  a countdown under them ("in 12 days", "tomorrow", "on now", "ended
  yesterday"), Days, Status, and Actions.
  Dates sort with "No dates" last whichever way.
- **Status** is Planning, Booked or Done, picked in Trip settings, the ⋮ in the trip's left panel. A trip
  turns Done by itself the day after its last day.
- **The toolbar,** in order: Archive and Delete for ticked rows (Put back
  and Delete for good on the Bin tab), the search
  (name or destination), the tag filter, Show map when hidden, Saved places,
  and New trip.
- **New trip** asks for the name, destination, number of days (1 to 60),
  currency and an optional start date. Create trip goes straight to the trip.
  A tick box, "Fill it with a first plan, drafted by AI", opens the trip on a
  drafted plan (see [Drafting a plan with AI](drafting-a-plan.md)). With a
  destination and an Unsplash key, the new trip gets a cover photo by itself
  (see "The cover photo" below).
- **A row's actions:** Copy, Archive or Bring back, and Delete. Delete moves
  the trip to the Bin at once, with Undo, so it doesn't ask first.
- **The Bin** (Tyler, 3 Nov 2026: "A Bin tab") holds deleted trips for 30
  days, with everything on them. Each row reads "Goes for good 3 Dec" under
  its dates, and its actions are Put back and Delete for good.
  - **Put back** returns the trip as it was, to the tab it came from, so an
    archived trip goes back to Archived.
  - **Delete for good** asks first, then the trip goes at once with every
    activity and note on it.
  - **After 30 days** a binned trip goes for good the next time the Trips
    table loads.
  - **While it is in the Bin** the trip doesn't open, its link answers like a
    trip that doesn't exist, its phone calendar stops until it is put back,
    and it is off the map of places visited and out of Copy trip.
  - Trip settings' Delete trip does the same, then goes back to Trips.
  - A binned sample trip still counts as given, so it never comes back as a
    new sample.
- **Copy trip** asks for a name, starting as "Copy of Tokyo". The copy keeps
  the days, their descriptions, every activity in its place with its
  type, times, place, links, notes, cost and picture, and both lists,
  unticked. It drops the dates, Done, ratings, documents and the phone
  calendar link.

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
  icon moves it to the trip's bin, with Undo.
- **The open activity is in the address**, `?open=<id>`, so a reload or a
  pasted link opens the same one. On arrival with nothing open, the first
  activity of Day 1 opens (Ideas count last), so the right panel is never
  empty. A trip with no activities says how to add one.
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
