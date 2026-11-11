# The day board

The trip page's middle panel. Board is the first tab; List, Calendar and Map
show the same activities another way, and the tab picked last is remembered in
this browser.

## Columns and cards

- **One column per day,** Ideas first. Ideas holds places not on a day yet, and
  its cards have no start time.
- **A day's heading** reads "Day 3 · Tue 19 Jan", the date only on a trip
  with a start date (Tyler, 3 Nov 2026: "Move the date here so it'll look
  like Day 3 - Tue 19 Jan"). The count of activities and the city line are
  gone ("Remove this text"). The day's description is under it, written in
  place: click it, type, then Enter or click away; Escape puts it back. An
  empty one shows "Add a description" only while the column is pointed at.
  Days no longer have a city; one saved before 3 Nov 2026 is ignored.
- **How full the day is** (Tyler, 5 Nov 2026: "12 hours, warn past it"): a
  thin bar under each day's heading fills with the hours its timed cards
  take, against 12 hours, and turns the warning colour past 12. Pointing at
  it says "7h 30m of 12h planned". Every card on the day counts, whatever
  Filter is showing. An overlap counts once. Cards with no start time or no
  length count as nothing, and so do stays, so a day of untimed cards looks
  empty. Nothing counts past midnight. Ideas and folded days have no bar.
  The sum is `plannedMinutes` in `src/lib/travel/board.ts`.
- **No weather on the heading.** The day's forecast, what a far-off day is
  usually like, and its public holiday moved into each card's ⋮ menu, as a
  Weather row (Tyler, 4 Nov 2026: "remove the weather from the cards (except
  warning) and put it in the 3 dot dropdown right panel"; see
  [Activities](activities.md)). The warnings stay on the cards: "Holiday, may
  be shut" and "Rain on Tue" with its Move button, below.
- **Public holidays** (Tyler, 4 Nov 2026: "Heading + card warning", before
  the heading line moved into the ⋮ menu). On a public holiday in the
  destination's country, the day's Sight and Food cards read "Holiday, may be
  shut" in red, after any opening-hours warning, which comes first. Only
  holidays the whole country keeps count; compact cards leave the line off.
- **Add a day:** the "+" after the last day's column adds one at the end of
  the trip, up to 60 (Tyler, 3 Nov 2026: "Add an + icon here to add a day").
  A day's own menu still adds one after it.
- **A card shows everything** (Tyler, 2 Nov 2026): the picture, the type icon
  and name, the start and end time, the nights of a stay, the cost, and the
  stars once rated. A card set outside its place's opening hours says so in red.
- **Shut all day.** A card on a day its place is shut, such as a museum on
  its closed Monday, says "Closed on Mondays" in red whether or not it has a
  start time, with a "Move to Tue" button along its foot (Tyler, 3 Nov 2026:
  "Warning + Move button"). The button moves it to the nearest day of the
  trip the place is open, the later day when two are as near, with Undo. It
  needs a start date, to know the weekdays, and opening hours on the place.
  A place open on none of the trip's days warns with no button. Compact
  cards leave the line off, to stay one line.
- **Part of the day.** A card with no start time can be set to Morning,
  Afternoon, Evening or Night in its When section (Tyler, 3 Nov 2026: "Add
  Night too"). The card shows it where the time would be, with a sunrise,
  sun, sunset or moon.
- **The order in a day:** Morning, then Afternoon, then Evening, then Night.
  A timed card counts as the part its hour falls in: before 12:00 Morning,
  12:00 to 17:00 Afternoon, 17:00 to 21:00 Evening, after that Night. Inside
  a part, timed cards come first, earliest first, then the untimed ones set
  to that part, in the order they were dragged. Cards with no time and no
  part go last, in dragged order. With no parts set this is the old order:
  timed cards by time, then the rest. Dragging a card somewhere else in its
  day keeps its time or part, so it goes back to its place. Setting a start
  time clears the part. Mass select's Move to Ideas, putting a card back
  from the bin into Ideas, and removing its day to Ideas drop both its time
  and its part; dragging a card into Ideas keeps them, as dragging always
  has.
- **Free time.** Between two timed cards, a line reads "1h 30m free" when the
  first card has a length and the gap is 15 minutes or more, or "Overlaps by
  30m" in red. With Google on and both places picked from Google, the line
  adds the travel time, such as "20m walk", and says "not enough time" when
  getting there takes longer than the gap. Filters hide these lines, because
  the time between two shown cards isn't free when hidden ones sit between.
- **Swap a rainy day** (Tyler, 4 Nov 2026: "From Google's place type"). On a
  day whose forecast is 70 out of 100 rain or more, an outdoor card reads
  "Rain on Tue" with "Move to Thu" along its foot, the same as the closed-day
  button. Thu is the driest forecast day of the trip under 30, the nearer one
  when two are as dry, and the move has Undo. With no day that dry, the card
  says "Rain on Tue" in red with no button. A card is outdoors when Google
  calls its place a park, garden, beach, hiking area, zoo, amusement park and
  the like (the list is `src/lib/travel/rainy-day.ts`), so only places picked
  or pasted since 4 Nov 2026 can warn. A shut-all-day warning wins over rain.
- **Rain at the card's hour** (Tyler, 6 Nov 2026: "Card + panel"). An outdoor
  card with a start time reads "40% rain at 2:30 PM" in its time row, from the
  chance of rain in the hour it starts, at 30 out of 100 or more, the same
  rule as the day's own rain line. The hour is the destination's own, read in
  the trip's time zone. Untimed cards, indoor cards and days past the
  14-day forecast show nothing. A card shut that day says that
  instead, and compact cards stay one line. A card on a very rainy day can
  carry both this line and the Move button above. The rule is `cardRainLine`
  in `src/lib/travel/rainy-day.ts`, and Open-Meteo's hourly chances come with
  the daily forecast in `src/server/travel/weather.ts`.
- **Must do** cards carry a flag after the name, and one still in Ideas once
  a dated trip has started reads "Must do, not on a day yet" in red (see
  [Activities](activities.md)).
- **Google's rating** shows on cards whose place came from Google, such as
  "Google 4.6 (2,300) · $$" (see [Activities](activities.md)).
- **Stays** are one card on their check-in day, reading "3 nights" (Tyler,
  2 Nov 2026: "Move to hotel stays into its individual cards", then "One card
  on check-in day"). They used to be a strip across the top of their days.

## Changing things

- **Drag a card** to another day or up and down a day. The column's new order
  is saved in one go.
- **Right-click a card** (or press and hold on a phone) for Mass select first,
  on the Board tab ("Hide select" while on), then Open, Duplicate, Move to
  day, Mark done, Mark must do, and Delete.
- **Done.** The tick in a card's corner marks it done; done cards fade and are
  struck through.
- **Undo.** After a move, delete, duplicate, copy or a change to several
  cards, a bar at the bottom says what happened, with Undo, for 6 seconds.
  Undo puts every card back where it was, with its start time and part of
  the day, and removes any copies. Marking
  Done or Must do has no Undo; pressing again undoes it.
- **A day's menu** (the three dots) adds a day after it, fills it with AI,
  puts it in its best order, copies its cards onto another day, or removes
  it. Removing a day with cards asks whether to send
  them to Ideas or delete them to the bin. Later days move back by one, with
  their descriptions, and a dated trip ends a day sooner.
- **Fill this day** (Tyler, 4 Nov 2026: "Timed, in the gaps") asks AI for
  sights and meals in the day's free time, around what it already holds. The
  free time is every gap of 45 minutes or more between 8:00 AM and 10:00 PM,
  counting a timed card with no length as an hour. The AI is told the day's
  cards, which are Must do, where the night is spent and every place already
  on the trip, and adds 1 to 4 timed cards, with a meal at lunch or dinner
  time when that is free. Each answer is checked: a card outside the gaps is
  dropped, one running past its gap is cut to fit (or dropped when under 30
  minutes would be left), and none overlap. They show first in the Draft a
  plan window, titled "Fill Day 2", to untick or change, and Create adds them
  with Undo on the bar at the bottom. A day with no gap says so and asks
  nothing. It needs the trip's destination and an AI key (see
  [Drafting a plan with AI](drafting-a-plan.md)).
- **Best order** (Tyler, 3 Nov 2026: "From the hotel") puts the day's cards
  with no start time and a place from Google in the quickest order to get
  round, in the trip's way of getting around (Trip settings → Getting
  around). The day sets out from the stay where last night was spent, or
  tonight's when there was none, and comes back to tonight's. A stay is any
  card with nights, such as a 3-night hotel checked in on Day 1, which covers
  the nights of Days 1, 2 and 3. With no stay, the first of those cards stays
  first. Timed cards stay where their times put them, and stays and cards
  with no Google place keep their order after the rest. A part of the day
  still wins over the order, so a Morning card stays before an Afternoon one.
  - Up to 8 cards, every order is tried. Past 8, each step goes to the
    nearest card left.
  - The toast says what it saved, such as "Day 2 in its best order: saves
    25m of walking", with Undo. A day already in its best order says so and
    changes nothing. When Google finds no route between two of the places,
    the order still changes, and the toast says the time saved isn't known.
  - It needs `GOOGLE_MAPS_API_KEY`; without it the toast says Google Maps
    isn't set up. Google charges for each new pair of places: five cards and
    a hotel are 15 pairs the first time, and none after, because every time
    is saved (see [Outside services](outside-services.md)). The time one way
    counts for both ways. One person can order 30 days in 10 minutes.
  - The code is `src/lib/travel/best-order.ts` and
    `src/server/travel/best-order.ts`.
- **Drag a day's heading** to move the whole day to another place in the trip.
- **Fold a day** with the arrows in its heading, or a double-click on the
  heading, down to a thin strip with its name sideways. Fold every day folds them all, and pressing it again unfolds them. Folded days are remembered per trip in this browser.
- **Jump to a day** with the calendar button beside the Ideas bulb, on the
  Board tab (Tyler, 5 Nov 2026: "Day and date only"). It lists every day as
  "Day 3 · Wed 12 Mar", or "Day 3" on a trip with no dates. Picking one
  scrolls the board to it, smoothly unless the device asks for less motion,
  and opens it first if it was folded. On a phone it switches to that day.
- **Hide Ideas** with the bulb before Filter in the header.
  It's lit while Ideas shows and unlit while it's hidden; press it again to
  bring Ideas back (Tyler, 3 Nov 2026: "the eye icon should be an idea kind
  of icon instead", "move the idea icon here").
- **Drag empty space to scroll sideways:** pressing anywhere on the board
  that isn't a card, a button or a day's heading and dragging moves the board
  left and right, the way a map pans (task "Misc"). Empty space shows an open
  hand, and a closed one while dragging; a card shows the pointer, since it
  opens on a click.
- **Compact cards** shows one line per card: icon, time and name. It is
  remembered in this browser. Compact cards and Fold every day float together
  at the board's bottom right (Tyler, 3 Nov 2026: "Move the 2 fold icons to
  the bottom right of the canvas").
- **Mass select** is in the ⋮ after "+ Add", on the Board tab, and first in
  a card's right-click menu (the Admin 3 panel design, Tyler, 6 Nov 2026:
  "mass selects is also not ui standards"). Until then it was a small button
  left of the search. Picked, it reads "Hide select" and shows a tick box on
  each card. Turned on from a card's right-click, that card starts ticked;
  from the ⋮, none is. Leaving the Board tab turns it off. Ticked cards
  gather in the "N selected" button. Its first row is Mark done (Tyler, 4 Nov
  2026: "Mark done / not done"), which reads Mark not done when every ticked
  card is already done, then Move to day and Delete. Mark done is one request
  with no Undo, the same as the single tick. The cards change on the board and
  nothing pops up.
- **Today.** While a dated trip is on, the board opens on today's column and
  marks it Today. Today is worked out in the trip's time zone, from Trip
  settings, or the reader's own when none is set.

## Search, Filter and Views

- **Search activities** is in the ⋮ after "+ Add", not a button in the
  header (the Admin 3 panel design, 6 Nov 2026). It opens the search box in
  the header with the cursor in it, once the menu has closed. The box stays
  while something is typed; Escape empties and closes it.
- The search matches words in a card's name or place.
- **No matches:** a search or filter that hides every card says so under the
  header, `No activities match "x".`, with a Clear filters button.
- Filter narrows by activity type, and since 4 Nov 2026 by Done (done or not
  done), Part of day, Place (no place yet), Cost (has a cost or none) and Must
  do (Tyler: "Done or not done", "Part of the day", "No place yet", "Has a
  cost / no cost"). Part of day counts a timed card by its hour, the same
  split the day's order uses. No place yet means no address and no Google
  place. Every filter lives in the address, so a pasted link opens the same
  view, and Clear empties them all. The filters apply to every tab.
- Save as view keeps the filters and search under a name, in the shell's
  saved views, and its line names each one, such as "Food · Not done ·
  Morning". Views opens one exactly as saved. A view whose type was removed
  opens without it and says so.

## The other tabs

- **List:** a row per activity, grouped by day with Ideas last. Each day's
  heading is grey 14px text with 10px above and below, bigger than the
  shell's table headings (Tyler, 3 Nov 2026: "this font should be bigger and
  have more spacing", then "make it gray color"). The heading is the day
  alone, with no count after it: the number of activities read as part of the
  date ("What is the 3 for?" ... "remove it").
  Since 6 Nov 2026 it is drawn as Project's list is (Tyler: "The list view
  should match that of the list view of the project app. Add what make sense
  and ignore what doesnt"):
  - **Folding:** pressing a day's heading, or the arrow that shows on
    pointing at it, folds its rows. Folds are kept per trip in this browser,
    apart from the board's folded columns.
  - **The heading's "+"** shows on pointing and opens New activity set to
    that day, or to Ideas.
  - **Each row** is a little tighter: a Done circle that marks it done or not,
    a circle with a tick, green once done (Tyler, 6 Nov 2026: "make the
    checkbox green color", then "just chanbge the color"),
    the name, then Time, Type, Cost and Delete. Delete moves it to the bin
    with Undo. A press anywhere else on the row opens it on the right.
  - **Type changes from its cell:** a press opens your types, and a pick saves.
  - **Sorting:** Activity, Type and Cost sort within each day. Time is the
    day's own order, the board's, and pressing it again turns it round.
  - **Mass select** works here as on the Board, from the ⋮ or first in a
    row's right-click, which is the card's menu. It shows tick boxes, a tick
    box over the column to tick every row in view, and drag handles. A row
    dragged under another day moves there, with Undo; a row with a start time
    keeps its place by time. With a column sorted, rows don't drag, and a
    line offers "Use the day's order".
  - **Left out from Project:** status, priority, person and due, which a trip
    doesn't have, the count after a heading (Tyler's 3 Nov rule above), and
    the open cog at the end of a row, since a press on the row opens it.
  - The name takes whatever width the other columns leave and cuts a long
    name short, so a row never runs past the panel, at 1440 wide with Mass
    select on too.
- **Calendar:** the trip's dates as weeks, each day listing its activities by
  time. A trip with no start date says so, with a date picker that saves one.
  A card drags onto another day of the trip (Tyler, 4 Nov 2026: "Keep time
  and part"), keeping its start time and part of the day, with Undo, through
  the board's own move. A drag starts after 8px, so a click still opens the
  card. Dates outside the trip take no drop.
- **Map:** the activities picked from Google as numbered pins, one colour per
  day, joined in the day's order by a straight line in the day's colour
  (Tyler, 3 Nov 2026: "Straight lines", free, showing the order only), with a day picker. Clicking a pin opens the activity. Activities with
  no Google place are listed under the map. The map needs
  `GOOGLE_MAPS_BROWSER_KEY`.
- **Photos** (Tyler, 5 Nov 2026: "Cards and notes"): every card's photos and
  every picture in the notes, as one grid with a heading per day and how
  many photos it holds, then Ideas, then "Trip notes" for the pictures in the
  trip's description and notes. Days with no photo are left out. A card's
  photo, or a picture in a card's notes, opens that card. A picture in the
  trip's description or a trip note opens it in the left panel. It follows
  the search and Filter, like the other tabs. Unsplash photos load small; an
  uploaded photo loads as it is. A trip with no photos says how to add one.
  On a screen under 1280px wide, or with the left panel folded away, the note
  opens out of sight, so the left panel has to be shown first.
- **The ⋮ at the end of the header,** after "+ Add" (Tyler, 6 Nov 2026: "The
  3 dots icon is supposed to be here"), holds Search activities, Mass select
  (on the Board tab), then the Bin with how many cards are in it. Its hover
  hint names them. It took the place of the More dropdown (Tyler, 3 Nov 2026:
  "Replace the "More" dropdown with a 3 vertical dot") and sat after the tabs
  until 6 Nov 2026. The header reads: the tabs, "N selected", the Ideas bulb,
  Jump to a day, Filter, Views, "+ Add", then the ⋮.

## + Add

The last button in the header is "+ Add" (Tyler, 3 Nov 2026: "Rename the
"new activity" button to "+ Add" clicking on this opens a dropdown to give me
3 options: New activity, Paste a booking, Add to calender").

- **New activity** opens the New activity dropdown in the same place, set to
  Day 1, with the cursor in Name.
- **Paste Maps links** opens a window that takes up to 20 Google Maps links
  at once (see [Activities](activities.md)).
- **Draft a plan** asks AI for sights and meals on each empty day (see
  [Drafting a plan with AI](drafting-a-plan.md)).
- **Paste a booking** opens its window ([Booking emails](booking-emails.md)).
- **Add to calendar** opens the phone calendar window
  ([Phone calendar](phone-calendar.md)).
- In a narrow panel the button is the + alone.
- The menu is as wide as its longest row (Tyler: "Too much space here"), and
  so is the ⋮ after it. Both are menus of actions, drawn by the
  shell's `folding-menu.tsx`. The settings menus (Trip settings and an
  activity's ⋮) are the tabbed menu of grouped rows instead (see
  [Activities](activities.md)).

## The bin

Deleted cards and deleted trip notes (Travel features 4, part 6; see
[The trip's left panel](the-trip-panel.md)) stay in the trip's bin for 30
days, newest first, then go for good when the bin is next opened. Put back
returns a card to the end of its old day, or to Ideas when that day no longer
exists, and a note to the notes list. Delete for good asks on the row itself
("Delete for good?" with Delete and Cancel), since it can't be undone, then
empties one now (6 Nov 2026; before then it didn't ask). The count after Bin
in the ⋮ holds both.

## On a phone

Under 640px wide the board shows one day at a time, with arrows either side of
the day's name and a sideways swipe of 60px or more to move a day. Opening a card switches to the Activity pill.
Moving a card to another day is press and hold, then Move to day.

## Where it lives

`src/components/travel/day-board.tsx`, `day-column.tsx`, `board-card.tsx`,
`board-actions.tsx` and `schedule-panel.tsx`. The order and gap rules are
`src/lib/travel/board.ts`. Day changes are `src/server/travel/days.ts`.
Fill this day's gaps are `src/lib/travel/fill-day.ts` and its AI call
`fillTripDay` in `src/server/travel/trip-draft.ts`; the rainy-day swap is
`src/lib/travel/rainy-day.ts`; typical weather and holidays are
`src/server/travel/trip-outlook.ts`; the filters are
`src/lib/travel/trip-search.ts` and `trip-views.ts`.
