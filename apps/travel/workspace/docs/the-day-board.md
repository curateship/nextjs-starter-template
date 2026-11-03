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
  The forecast for the day sits below on a trip within the next 14 days (see
  [Outside services](outside-services.md)), at the trip's destination. Days
  no longer have a city; one saved before 3 Nov 2026 is ignored.
- **Add a day:** the "+" after the last day's column adds one at the end of
  the trip, up to 60 (Tyler, 3 Nov 2026: "Add an + icon here to add a day").
  A day's own menu still adds one after it.
- **A card shows everything** (Tyler, 2 Nov 2026): the picture, the type icon
  and name, the start and end time, the nights of a stay, the cost, and the
  stars once rated. A card set outside its place's opening hours says so in red.
- **The order in a day:** cards with a start time come first, earliest first.
  Cards with no time follow, in the order they were dragged. Dragging a timed
  card somewhere else keeps its time, so it goes back to its time's place.
- **Free time.** Between two timed cards, a line reads "1h 30m free" when the
  first card has a length and the gap is 15 minutes or more, or "Overlaps by
  30m" in red. With Google on and both places picked from Google, the line
  adds the travel time, such as "20m walk", and says "not enough time" when
  getting there takes longer than the gap. Filters hide these lines, because
  the time between two shown cards isn't free when hidden ones sit between.
- **Stays** are one card on their check-in day, reading "3 nights" (Tyler,
  2 Nov 2026: "Move to hotel stays into its individual cards", then "One card
  on check-in day"). They used to be a strip across the top of their days.

## Changing things

- **Drag a card** to another day or up and down a day. The column's new order
  is saved in one go.
- **Right-click a card** (or press and hold on a phone) for Open, Duplicate,
  Move to day, Mark done, and Delete.
- **Done.** The tick in a card's corner marks it done; done cards fade and are
  struck through.
- **Undo.** After a move, delete, duplicate, copy or a change to several
  cards, a bar at the bottom says what happened, with Undo, for 6 seconds.
  Undo puts every card back where it was and removes any copies. Marking
  Done or Booked has no Undo; pressing again undoes it.
- **A day's menu** (the three dots) adds a day after it, copies its cards onto
  another day, or removes it. Removing a day with cards asks whether to send
  them to Ideas or delete them to the bin. Later days move back by one, with
  their descriptions, and a dated trip ends a day sooner.
- **Drag a day's heading** to move the whole day to another place in the trip.
- **Fold a day** with the arrows in its heading, or a double-click on the
  heading, down to a thin strip with its name sideways. Fold every day folds them all, and pressing it again unfolds them. Folded days are remembered per trip in this browser.
- **Hide Ideas** with the bulb between the search and Filter in the header.
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
- **Mass select** shows a tick box on each card. Ticked cards gather in the
  "N selected" button, which moves them to a day or deletes them.
- **Today.** While a dated trip is on, the board opens on today's column and
  marks it Today. Today is worked out in the trip's time zone, from Trip
  settings, or the reader's own when none is set.

## Search, Filter and Views

- The search matches words in a card's name or place.
- Filter narrows by activity type. It lives in the address, so a pasted link
  opens the same view.
- Save as view keeps the filters and search under a name, in the shell's
  saved views. Views opens one. A view whose type was removed opens without it
  and says so.

## The other tabs

- **List:** a row per activity, grouped by day with Ideas last. Each day's
  heading is grey 14px text with 10px above and below, bigger than the
  shell's table headings (Tyler, 3 Nov 2026: "this font should be bigger and
  have more spacing", then "make it gray color"). The heading is the day
  alone, with no count after it: the number of activities read as part of the
  date ("What is the 3 for?" ... "remove it").
- **Calendar:** the trip's dates as weeks, each day listing its activities by
  time. A trip with no start date says so, with a date picker that saves one.
- **Map:** the activities picked from Google as numbered pins, one colour per
  day, with a day picker. Clicking a pin opens the activity. Activities with
  no Google place are listed under the map. The map needs
  `GOOGLE_MAPS_BROWSER_KEY`.
- **The ⋮ after the tabs** holds the Bin, with how many cards are in it.
  It took the place of the More dropdown and sits level with the tab names
  (Tyler, 3 Nov 2026: "Replace the "More" dropdown with a 3 vertical dot";
  then "not aligned").

## + Add

The last button in the header is "+ Add" (Tyler, 3 Nov 2026: "Rename the
"new activity" button to "+ Add" clicking on this opens a dropdown to give me
3 options: New activity, Paste a booking, Add to calender").

- **New activity** opens the New activity dropdown in the same place, set to
  Day 1, with the cursor in Name.
- **Paste a booking** opens its window ([Booking emails](booking-emails.md)).
- **Add to calendar** opens the phone calendar window
  ([Phone calendar](phone-calendar.md)).
- In a narrow panel the button is the + alone.
- The menu is as wide as its longest row (Tyler: "Too much space here"), and
  so is the ⋮ menu after the tabs. Both are Travel's one dropdown look, the
  same as an activity's ⋮ (see [Activities](activities.md)).

## The bin

Deleted cards stay in the trip's bin for 30 days, then go for good when the bin
is next opened. Put back returns a card to the end of its old day, or to Ideas
when that day no longer exists. Delete for good empties one now.

## On a phone

Under 640px wide the board shows one day at a time, with arrows either side of
the day's name and a sideways swipe of 60px or more to move a day. Opening a card switches to the Activity pill.
Moving a card to another day is press and hold, then Move to day.

## Where it lives

`src/components/travel/day-board.tsx`, `day-column.tsx`, `board-card.tsx`,
`board-actions.tsx` and `schedule-panel.tsx`. The order and gap rules are
`src/lib/travel/board.ts`. Day changes are `src/server/travel/days.ts`.
