# The Trips dashboard

`/trips`, reached from Trips in the left menu's Travel section, is one
three-panel dashboard laid out as the Admin dashboard and the CRM are.

## Tyler's rules

His words of 12 Nov 2026. They outrank the code.

- **One dashboard:** "We need to consolidate and reorganize the trips
  dashboard. It needs to be one cohesive 3 panel design. The left panel can
  have the dashboard block that list Overview widgets, trips, places."
- **Header buttons stay out of dropdowns:** "Search and mass select as well as
  bin is no longer goes into the dropdown." Search and Mass select are buttons
  of their own, and the Bin is a tab.

This replaced the rule of 6 Nov 2026 that the Trips table stays a table. The
table is still there, as the middle of the Trips section.

## The left panel

- **The header** has the collapse button, "Trips", and the ⋮ with two tabs:
  - **General:** the page's Cover photo, and Lock blocks in its footer.
  - **Widgets:** Overview's rows and spots.
- **The page** under it is each person's own, written on like any page in the
  design, with the basic "/" blocks and two of Travel's own:
  - **Dashboards** is fixed. It can't be deleted, the server puts it back at
    the top of a page saved without it, and its ⋮ moves it up and down.
  - **Tags** lists every tag on the person's trips with how many trips carry
    it. Pressing one opens Trips narrowed to that tag; pressing it again lets
    it go. It took the place of the Trips table's tag dropdown.
- **A new page** starts with Dashboards, then Tags.
- **While the page is read,** or when it could not be, the Dashboards block is
  drawn on its own, since it is the only way between the sections.

### The Dashboards block

- **Its rows** are Overview, Trips and Places, each with a count:
  - Overview counts its widgets.
  - Trips counts the upcoming trips.
  - Places counts the saved places.
- **Its ⋮** has an eye on Trips and on Places to hide or show each, and a grip
  to drag them into another order. Overview always shows and stays first. A
  hidden section keeps its row while it is the one showing.
- **What is hidden and the order are each person's own,** kept with their
  page, so they follow them to another browser.

## Overview

Overview's widgets sit straight on the dashboard, beside the left page, in
the shell's grid of up to two rows. Overview has no right panel. Each widget
shows once, and each person's layout is their own. A widget's ⋮ and an empty
spot change it, and so does the left ⋮'s Widgets tab.

- **The layout to start with:**
  - Top row: Next trip, Map and Year.
  - Bottom row: Must do, Weather, Holidays and Best rated.
- **Next trip:** the trip that's on today, with "Day 2 of 4" and Open today.
  When none is on, the soonest dated trip still to come, with its countdown
  and Open trip. Archived trips and the Bin are left out.
- **Map:** the map that sat above the Trips table, with Destinations and Been
  as a switch in its heading.
  - Destinations pins each trip's destination, and a pin opens the trip.
  - Been pins every card marked Done, and a pin shows a small card with the
    place, its trip, its stars and Open trip.
  - It needs `GOOGLE_MAPS_BROWSER_KEY` ([Outside services](outside-services.md)),
    and loads Google Maps only while the widget is on Overview.
- **Year:** the year's months across the top and each dated trip as a bar
  across its days. A bar opens its trip, and the arrows step a year at a time.
  - It holds every trip not in the Bin, archived ones too.
  - Trips with no dates can't be placed, so a line says how many there are.
  - It was the Trips table's Year tab until 12 Nov 2026.
- **Must do:** the next trip's cards marked Must do and not done yet, each
  opening on the trip.
- **Weather:** the next trip's days with their forecast when they're within 14
  days, or what that time of year is usually like. It is the same reading the
  trip's board shows, and needs the trip's dates and destination.
- **Holidays:** public holidays that fall on the next trip's days.
- **Best rated:** places given stars on any trip, most stars first.
- **Countries:** the countries and cities been to, from the places marked
  Done. The country is the last part of the address and the city the part
  before it, so "Tokyo 144-0041, Japan" is Japan and Tokyo. A place whose
  address has no comma is counted as having no address, and the widget says
  how many those are.
- **Ideas:** cards still in the Ideas column of upcoming trips.
- **Money this year:** what the trips that started this year came to, one
  line per currency.
  - It adds each trip's costs on its days, as the Budget block does, so
    Ideas are left out.
  - Each currency is summed apart, since the app keeps no exchange rates. A
    year with a CA$1,200 trip and a ¥80,000 trip shows both lines.
- **Next trip's money:** how much of the next trip's budget is planned, such
  as "CA$1,200 of CA$3,000", with a bar. Going over the budget says by how
  much.

The widgets are listed in `src/lib/travel/trips-widgets.ts` and drawn in
`src/components/travel/trips-overview.tsx`.

## Trips

- **The middle** is every trip of the person signed in, in the dashboard's
  one header and table shape.
- **The tabs** are Upcoming, Past, Archived and Bin, each with its count,
  kept in the address as `?show=past`, `?show=archived` or `?show=bin`.
  Where the middle is too narrow for tabs beside the search and buttons, as on
  a phone, they are one dropdown naming the tab showing.
  - Upcoming is every trip that hasn't ended, trips with no dates included.
  - Upcoming folds into This month (on now or starting this month), Next
    month, Later and No dates.
- **The header,** after the tabs, has:
  - "N selected" while rows are ticked: Archive or Bring back, and Delete; on
    the Bin, Put back and Delete for good.
  - Search (name or destination).
  - Mass select.
  - Filter, with one tag.
  - New trip.
- **The columns,** each sorting when its heading is pressed. The sort is kept
  in the address (`?order=days&direction=asc`), so a reload keeps it:
  - Trip: the cover, name, destination and tags.
  - Dates, with a countdown under them ("in 12 days", "on now", "ended
    yesterday"). "No dates" sorts last whichever way.
  - Days and Status.
  - Rating: the average of the stars given to the trip's cards, such as 4.3.
- **The table has no actions column.** A row's right-click menu has Mass
  select, Open trip, Copy, Archive or Bring back, and Delete.
- **New trip** opens the New trip window. It asks for the name, destination,
  number of days (1 to 60), currency and an optional start date.
  - Create trip goes straight to the trip.
  - "Fill it with a first plan, drafted by AI" opens the trip on a drafted
    plan ([Drafting a plan with AI](drafting-a-plan.md)).
- **Status** is Planning, Booked or Done. A trip turns Done by itself the day
  after its last day.

### The picked trip, on the right

Drawn from Tyler's picture of 12 Nov 2026 ("redesign the right trip panel"),
with every text size then made 20 out of 100 smaller ("reduce fonts by
20%") and 10 out of 100 bigger again ("too small, increase by 10%"): the name
13.2px, dates, status and day names 14.08px and the small lines 12.32px. The tabs keep the shell's 14px, as every other
tab row does ("tabs font is too small").

- **The header** sits on a soft sky with the trip's cover as a small rounded
  picture, its name and destination, then its ⋮ and the collapse button. It
  has no line under it. The sky fades down behind Dates and Status into the
  panel (Tyler, 12 Nov 2026: "remove the border here and make that part
  transparent so we can see the sky background blended in").
- **The ⋮** is the same Trip settings as on the trip page, so the trip's
  name, destination, tags, cover, dates, time zone, status, currency and how
  you get around all change here without opening it.
  - Copy and Archive (or Bring back) sit above Rate the trip and Lock
    blocks. Open trip is the button at the foot.
  - Delete trip is last, in red, and moves the trip to the Bin.
- **Dates and Status** sit side by side with a line between, or one under the
  other when the panel is narrow.
  - Dates has the countdown under it, such as "in 67 days".
  - Status has its dot (blue Planning, amber Booked, green Done), with the
    tags and the rating under it, such as "Sample · Not rated".
- **Three tabs,** each with its count, on a faint grey band (Tyler, 12 Nov
  2026: "add a faint light gray bg over the tabs"):
  - **Itinerary:** each day as a 32px tile ("reduce the calender icon by
    20%", from 40px) with its number, its date with the day's own
    description under it ("add trip discription here"; the words written in
    the day's heading on the board, such as "Asakusa and the bay"), how many
    activities it has (or Free) in a grey chip beside the date ("move the
    activities here and style it in a chip"), and an arrow.
    - Pressing a day folds open its activities in place, and pressing it
      again folds them away (Tyler, 12 Nov 2026: "dont link the days to the
      trip page. Just open a toggle to show the title of the activities, its
      icon and time of day").
    - An open day is a light grey band running to the panel's edges, with no
      margin or rounded corners ("dont make the toggle open into a card with
      outer paddings like that"), otherwise drawn from his picture ("style it
      like this"). Its tile turns light blue.
    - Each activity shows its picture, or its first other photo, or its
      type's icon when it has neither. Then its name, and its time: a timed
      card's start, such as 8:10 AM, or its part of the day, such as Morning.
    - An activity opens on the trip page ("clicking on the activity links to
      the activity page"). "Open day plan" at the band's foot opens the trip
      on that day's first card.
  - **Photos:** every photo on the trip's cards, each picture once. A photo
    opens the trip on its card.
  - **Notes:** the trip's notes, pinned first with a pin. A note opens the
    trip with that note showing in its left panel, through `?note=`, which
    the address lets go once it is shown.
- **The foot** has Open trip, a button across the panel that goes to the
  trip page (Tyler, 12 Nov 2026: "add a footer button link to the trip").
- **A trip in the Bin** shows its dates with "Goes for good 3 Dec" and a line
  saying to put it back, and has no foot, since it doesn't open. Its ⋮ holds Put back and Delete for good.

### The Bin

Tyler, 3 Nov 2026: "A Bin tab".

- **What it holds:** deleted trips, for 30 days, with everything on them.
  Each reads "Goes for good 3 Dec" under its dates.
- **Delete** moves a trip there at once, without asking, because the Bin can
  bring it back.
- **Put back** returns the trip as it was, to the tab it came from.
- **Delete for good** asks first, then the trip goes at once with every
  activity and note on it.
- **After 30 days** a binned trip goes for good the next time Trips loads.
- **While it is in the Bin:**
  - The trip doesn't open, and its link answers like a trip that doesn't
    exist.
  - Its phone calendar stops until it is put back.
  - It is off the map and out of Copy trip.
- **Trip settings' Delete trip** does the same, then goes back to Trips.
- **A binned sample trip** still counts as given, so it never comes back as a
  new sample.

### Copy trip

- **It asks for a name,** starting as "Copy of Tokyo".
- **The copy keeps** the days, their descriptions, and every activity in its
  place with its type, times, place, links, notes, cost and picture.
- **It drops** the dates, Done, ratings, documents and the phone calendar
  link.

## Places

The person's places in one list. They were a window behind a button, and a
switch on the map, until 12 Nov 2026.

- **The tabs,** a dropdown where the middle is too narrow, as on Trips:
  - **Saved:** the saved places, newest first.
  - **Go again:** every card ticked Would go again, on any trip not in the
    Bin.
  - **Been:** every card marked Done, on any trip not in the Bin.
  - **Bin:** saved places deleted in the last 30 days.
- **The header:**
  - "N selected" on Saved (Delete) and on the Bin (Put back, Delete for good).
  - Search: the name, the address, or the trip it was on.
  - Mass select, on Saved and the Bin only. Go again and Been are cards on
    trips, changed from the right panel one at a time.
  - Filter, with three rows: Type (one activity type, or No type), Group (by
    trip or by type; Saved and the Bin fold by type only) and Order (newest
    first, name, most stars, or the last time you went).
  - New place, on Saved.
- **Pressing a column's heading** sorts by it, and pressing it again goes back
  to newest first.
- **New place** asks for the place, found on Google or typed, and its type.
  - Create saved place makes it and opens it on the right, where its picture
    and notes go.
  - A place picked from Google brings its address, website and phone with it.
- **Deleting a saved place** moves it to the Bin without asking.
  - Put back brings it back.
  - Delete for good asks first.
  - A place in the Bin more than 30 days goes for good the next time the Bin
    is opened.
  - Copies already on a trip stay either way.

### The picked place, on the right

- **The header:** the place's type icon and name, then its address, or for a
  card its trip and day.
- **The body:**
  - A small map of it, when it has a position.
  - Its address, Google's stars and price, and its website, menu and phone.
- **For a saved place,** its name, type, picture and notes change here, each
  saving itself.
- **For a card from a trip:**
  - Its stars and Would go again are set here, saved on the trip's card the
    moment they change. Pressing the stars given again takes them away.
  - "Open it in Tokyo, 5 days" opens the card on its trip.
- **The foot:**
  - Google Maps opens the place in a new tab.
  - Add to a trip opens a small box with the trip and the day, upcoming trips
    first, then Add. The place is copied to the end of that day, or into the
    trip's Ideas, and the trip opens on the copy.
  - A place already on the trip is skipped, and the error says where the
    first one is, such as "Haneda Airport is already on Day 1."
  - A card from Been can be added only once it is ticked Would go again, as
    on the trip page.
  - The bin, on a saved place.

Inside a trip, "+ Add" still has Saved places, a window for adding a saved or
Go again place to that trip's Ideas. Its bin moves a place to Places' Bin.

## Coming back

- **The dashboard goes back to where it was.** Opened at its bare address, it
  returns to the address it last had: the section, tab, search, filters and
  the open trip or place.
- **With nothing open,** the first row opens, so the right panel is never
  empty on arrival. A remembered record that has gone gives way to the first
  row.
- **A tab, tag, filter or search that leaves the open row out of the list**
  opens the list's first row, so the right panel is never left empty either.
  On a phone a row opened that way waits behind its pill; only a row pressed
  brings the right panel to the front.
- **On a phone** one panel shows at a time, with a pill for each.
- **Older links still land:** `/trips?show=bin` opens Trips on its Bin.
  `/trips?show=year` opens Trips on Upcoming, since Year is a widget now.

## With no signal

The Trips dashboard opens read only from the last visit's copy, with the "No
signal" line above it ([Working without signal](working-without-signal.md)).

## Where the code is

- **The route:** `src/routes/_authenticated/trips/index.tsx`, with the address
  read by `readTripsSearch` in `src/lib/travel/trips-search.ts`.
- **The frame:** `src/components/travel/trips-dashboard.tsx`, built on the
  shell's `ThreePanels` and the CRM's `useCrmFrame`, `CrmListHeader` and
  `CrmTable`.
- **The left page:**
  - `trips-page-panel.tsx` and `trips-blocks.tsx`.
  - Kept in `travel_trips_pages`, one row per person, with the Overview
    layout and the hidden sections (`drizzle/0126_travel_trips_dashboard.sql`).
- **Trips:** `trips-table-section.tsx` and `trip-record.tsx`.
- **Places:** `places-section.tsx`, `place-record.tsx` and `add-to-trip.tsx`.
  - Saved places' bin is `travel_saved_places.deleted_at`, from the same
    migration.
- **Overview:** `trips-overview.tsx` and `trips-map.tsx`.
- **The server:** `src/server/travel/trips-dashboard.ts`, through
  `src/lib/api/travel/trips-dashboard.ts`.
  - Saved places' New place, bin and Add to a trip are in
    `src/server/travel/saved-places.ts`.
- **The sums:** `src/lib/travel/trips-lists.ts`, with its tests beside it.
