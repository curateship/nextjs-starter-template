# Activities

The right panel shows the open activity. It has no close button: the first
activity opens on arrival, and another opens when its card is clicked.

## The panel is its notes

Tyler, 2 Nov 2026: "The only thing I want to see is the tiptap editor like in
project task." So under the activity's name there is only its notes, always
open to write in, in the shell's editor. Clicking a card open puts the
blinking cursor in them, under "Write something", with no toolbar showing
until words are selected (task "Misc"; Tyler, 3 Nov 2026: "clicking on task
should not show the toolbar"). The activity opened by itself on arrival
leaves the cursor alone. The activity's picture
lies faintly behind the top of the panel, as the trip's cover does on the
left. Selecting words shows a toolbar over
them: bold, italic, headings, lists and link. Notes save 700ms after the last
letter, when the editor is left, and when another activity opens.

Notes are kept as the editor's own document (JSON), the way Project keeps a
task's notes, and cleaned on the server to what the shell's written pages
allow plus Travel's "/" blocks (`src/lib/travel/notes.ts`). Typing "/" in the
notes adds an Image, Place, Video or Map block: see
[Notes and the "/" blocks](notes-and-blocks.md). Anything that isn't such a
document is saved as no notes.

## More photos on a card

Tyler, 5 Nov 2026: "Row of small photos". A card holds up to 30 photos.

- **The row** sits at the top of the open card, above its notes, once the card
  has a picture. The picture itself is still set from the ⋮ menu's Picture
  section, or by picking a place.
- **The first photo is the card's picture,** the one on the board and behind
  the panel, and it has a ring round it. Dragging another photo to the front
  makes that one the card's picture.
- **"+" at the end** opens the media library straight away, to upload a photo
  or pick one already there (Tyler, 6 Nov 2026: "this didnt need to open a
  dropdown. Just open it straight to the media picker"). With Unsplash set up,
  an Unsplash button sits beside it. Each one is checked like the picture: one
  the person uploaded, or Unsplash's with its credit.
- **Clicking a photo** shows it large, with its credit, the arrows to the next
  and the one before, and Remove. Removing takes it off the card; the file
  stays in the media library.
- **Duplicate, Copy day and Copy trip** keep the photos with each copy. A card
  in the bin keeps its photos for when it comes back.
- **With no signal** the photos show and open, but can't be added, moved or
  removed.

The photos after the first are the `travel_activity_photos` table
(`drizzle/0104_travel_activity_photos.sql`); the whole row is saved at once by
`setActivityPhotos` in `src/server/travel/activity-photos.ts`.

## Been here before

Tyler, 5 Nov 2026: "Card mark + panel line". When a card's place was marked
Done on another of the person's trips:

- **The board card** gets a small clock-with-an-arrow mark after its name.
- **The right panel** says, above the notes, "Been here: Kyoto, March 2026, you
  gave it 2 of 5". The trip's name opens that card on that trip. With no
  dates on that trip the month is left out, and with no rating the rating is.
  More visits add "and 2 more times", and the line names the latest: by date,
  or, on trips with no dates, by when the card last changed.
- **Only cards with a place count, on both sides,** so two cards both called
  "Lunch" never match. Two places match when Google's place is the same, or,
  when either has no Google place, when the place names match
  (`samePlace` in `src/lib/travel/same-place.ts`). Two different cafes with
  the same name and no Google place do look like the same one.
- **Left out:** this trip's own cards, cards not Done, and trips and cards in a
  bin.

The matching is `listBeenHere` in `src/server/travel/been-here.ts`, loaded with
the trip page.

## The ⋮ menu

Tyler, 2 Nov 2026: "All of these are collapsible cards in a 3 dot dropdown ...
and move delete there too." The ⋮ in the panel's header opens a menu drawn like
the ⋮ on a task in Project. Each row shows what it holds now on the right and
folds open to change it. Every field saves itself.

- **Name and type,** and the Must do tick box (see "Must do" below).
- **When:** the day (Ideas or Day N), start time, length in hours and minutes,
  and nights for a stay. Nights shows for a Hotel or anything with nights set.
  Moving to another day can be undone from the bar at the bottom. A card on a
  day with no start time also has Part of the day: Any time, Morning,
  Afternoon, Evening or Night (see [The day board](the-day-board.md)). The
  row's summary reads "Day 2 · Morning".
- **Weather,** after When, on a card on a dated day (Tyler, 4 Nov 2026: "put
  it in the 3 dot dropdown right panel"). The row's summary is the day's
  forecast, such as "18° / 9° · 70% rain", or "Usually 24° / 15°" past the
  14-day forecast, or the holiday's name; folded open it shows the holiday,
  then the forecast or "Usually 24° / 15° · rain on 8 of 30 days", then, for
  an outdoor card with a start time, the chance of rain at its hour, such as
  "40% rain at 2:30 PM" (Tyler, 6 Nov 2026: "Card + panel"; see The day
  board). A card in Ideas, or a day with none of these, has no Weather row. The weather is
  loaded once per trip page and shared by both panels
  (`useTripWeather`, `src/components/travel/day-weather.tsx`).
- **Place:** a Google Maps link first (see below), then a search for the
  address. With Google on, picking a suggestion
  saves the place and fills its opening hours, website and phone. A typed
  place keeps what was there. "Open in Google Maps" opens it in a new tab.
  Opening hours can be typed by hand, a day at a time, with Closed. A start
  time outside the hours warns, such as "Closed at 6:00 PM on Tuesdays". A
  day the place is shut all day warns with or without a start time, "Closed
  on Mondays", with a "Move to Day 2 · Tue 3 Nov" button for the nearest
  day it's open, the same move as on the card. With no start date the
  weekday isn't known, so it doesn't warn. Website and
  Menu open in a new tab, and Phone has a Call button.
- **Cost:** in the trip's currency, added up in the trip's Money card.
- **Picture:** upload one, or search Unsplash. An Unsplash photo shows its
  photographer's credit.
- **How was it:** once the activity is done or its day is over, 1 to 5 stars,
  "Would go again", and Save to saved places.
- **Add tips** (see "Tips by AI" below), **Duplicate activity** and
  **Delete activity** end the menu, under the one line. Delete moves it
  to the trip's bin, with Undo. Delete is red.

The menu is drawn like Project's task menu (Tyler, 3 Nov 2026, from two
pictures of it: "the items dont have dividers except the divider that
seperate the delete"; then "duplicate goes here", with an arrow under the
line). Its rows have no lines between them. The one line runs edge to edge
under the last folding row, and Add tips, Duplicate activity and Delete
activity sit under it. Every row is 32px tall, and the rows touch with no gap between
them ("reduce space between items a bit").

Inside a folding row the row's own name is the field's label, so a field on
its own carries no second label on screen; screen readers still read one
(Tyler, 4 Nov 2026: "Remove all these duplicate labels"). The Cost field says
its money in its placeholder, such as "0 CAD". A row with several fields,
such as When, keeps a label on each.

Trip settings (the ⋮ in the trip's left panel), the schedule's "+ Add" and
the ⋮ after its tabs are the same menu, built from the same file,
the shell's `src/components/shared/folding-menu.tsx` (Tyler, 3 Nov 2026: "every time you created a dropdown,
you made something different so all of the dropdown has slightly different
ui"). A menu of actions alone, such as "+ Add", is as wide as its longest
row ("Too much space here").

The menu is 294px wide, and nothing inside it is ever wider: a long place
name is cut short with "…" in its row (Tyler, 3 Nov 2026: "drop down gets
cut off", when a long name pushed every field past the right edge). That is Project's 363px task menu made 10% narrower
twice (Tyler, 3 Nov 2026: "Reduce the dropdown by 10%", then again "reduce
dropdown with by 10%").

## A Google Maps link fills it in

Task "Misc": "Add ability to add a google map link and the app fills all the
fields automatically including the cover"; Tyler then picked "On an activity".

- **Where:** the Google Maps link field in New activity, where the name may
  then be left empty, and at the top of the ⋮ menu's Place section with Fill.
- **What it fills:** the name, the type (Google's kind of place matched to
  Flight, Hotel, Food, Sight, Transport or Other), the place and its position,
  opening hours, website, phone, and the place's first Google photo as the
  picture, saved into the person's media library.
- **Links it reads:** full Google Maps addresses and the short
  `maps.app.goo.gl` links from Share. Only Google's own addresses are ever
  fetched, one redirect at a time, so the server can't be sent anywhere else.
  At most 60 fills per person per 10 minutes.
- **Without a Google key, the app visits the link** (Tyler, 3 Nov 2026: "When
  i say step further I mean that the app takes another step to visit the
  google link and then capture the image"). The server opens the link in a
  hidden browser, waits for the venue's panel to draw, and reads its name,
  category (which picks the type: "Ramen restaurant" is Food), address,
  phone, website and main photo. The photo is downloaded from Google's photo
  host and saved into the person's media library. The page a server fetches
  without a browser holds none of this, because Google draws the panel in the
  browser (`src/server/travel/maps-browser.ts`).
  - A link that holds a place opens its panel straight away. A link with only
    a name and a pin is searched at the pin, and a search that lists several
    places opens the first. Each fill takes a few seconds, longer when it has
    to search.
  - Only Google's own addresses are opened in the hidden browser; fonts and
    map tiles aren't downloaded. One page at a time, and the browser closes
    after a minute with nothing to do. With four fills already waiting, a
    new one skips the browser and fills from the link alone, so one person
    pasting fast can't hold everyone up.
  - Opening hours aren't read from the panel; they come with the key.
  - When no panel shows, or the server has no browser, the link's own name,
    address and pin still fill in, with the map from its preview as the
    picture, and the toast says the rest needs the key.
  - **The live site needs a browser:** locally the app uses the Chromium that
    Playwright installed. The live web container has none. It needs Chromium
    added to the shared Dockerfile's web image (a shell file, so Tyler's call)
    and `TRAVEL_CHROMIUM_PATH` pointing at it. Until then the live site fills
    from the link alone.
- **With a Google key,** Google's place service fills everything including
  hours and its photo, and the hidden browser only opens when the service has
  no photo.
- **Cookie question:** in some countries a short link first goes to Google's
  cookie question; the real address inside it is read and checked like any
  other.
- **When it can't:** a link to something else says it isn't a Google Maps
  link; a link with no place in it says to copy the place's own link. From
  New activity the activity is still made, on the day picked with the name
  typed, and opens to be filled by hand; the error toast says why.
- **The code:** `src/server/travel/maps-link.ts` and `maps-browser.ts`.

## Pasting several Maps links

"+ Add" → Paste Maps links takes up to 20 Google Maps links in one go
(Tyler, 3 Nov 2026: "Ideas, wait for photos").

- **What it takes:** links one per line, or anywhere in other text, such as
  a list a friend sent. Only Google Maps addresses are picked out, each once,
  and a full stop or bracket after one isn't part of it. The window says how
  many it found as the text is pasted.
- **Where they go:** every card lands at the end of the trip's Ideas.
- **One at a time:** each link is filled the way the Google Maps link field
  fills one, photo included, then the next. The board reloads as each lands,
  and the window lists each by name, with "no photo" when none was found.
  Each takes a few seconds, so 15 links take about a minute. One at a time
  keeps the hidden browser's waiting line under its 4, so every card gets
  its photo and nobody else waits behind a long paste.
- **A link it can't read** makes no card. It is listed with why, such as
  "Google couldn't find a place from that link", and the rest carry on.
- **A place already on the trip** makes no card either. It is listed as
  "Skipped: Kinkaku-ji is already on Day 2." in grey, not as a failure (see
  "A place already on the trip" below).
- **Stopping:** "Stop after this one" ends the paste after the link being
  read, and closing the window does the same. What was made stays.
- **The limit:** each link counts as one of the 60 fills a person has in 10
  minutes. At the limit the paste stops and says to wait a few minutes.
- **The live site** has no hidden browser yet (see below), so there each
  card fills from its link alone, with no photo, until Chromium is added.
- **The code:** `src/components/travel/paste-links-dialog.tsx`,
  `addActivityFromMapsLink` in `src/server/travel/maps-link.ts`, and the link
  check, shared with the server, in `src/lib/travel/maps-links.ts`.

## No bookings

Tyler removed the booking feature on 2 Nov 2026. An activity has no Booked or
To book mark, confirmation number, booking link or files of its own; only the
cost stayed. The columns went in
`drizzle/0099_travel_remove_booking_and_journal.sql`. The trip's own documents
went too, on 2 Nov 2026 (see [The trip's left panel](the-trip-panel.md)).

## Google's rating, reviews and price

Tyler, 4 Nov 2026: "Rating, reviews, price", and "New fills only".

- **What shows:** a card whose place came from Google reads "Google 4.6
  (2,300) · $$" in grey, after its cost and the person's own stars. The words
  "Google" keep it from reading as the person's own rating. The Place section
  of the ⋮ menu shows the same line under the address. Compact cards leave it
  off.
- **The price** is Google's own scale of one to four $, whatever the trip's
  money, or Free.
- **Which cards:** only places picked from the search, filled from a Maps
  link, or found for a drafted plan since 4 Nov 2026. Older cards show
  nothing until their place is picked again. Without a Google key, a Maps
  link fills no rating.
- **Where it is kept:** inside the card's place, with Google's kinds of place
  (used for the rainy-day swap on [The day board](the-day-board.md)). So it
  travels with Copy trip, Copy day, Duplicate and saved places.
- **The code:** `placeExtras` in `src/server/travel/google.ts`, and the line
  in `src/lib/travel/google-rating.ts`.

## The picture of a picked place

Tyler, 4 Nov 2026: "Only fill if empty".

- **What happens:** picking a place from the search in the Place section
  fills the card's picture with that place's first Google photo, the way a
  Maps link does. It lands a moment after the place, saved into the person's
  media library.
- **Only when empty:** a card that already has a picture, uploaded or from
  Unsplash, keeps it. A picture set while the photo downloads wins too.
- **Drafted plans:** each place Google finds for Draft a plan or Fill this day
  gets its photo the same way.
- **Safety:** the photo must belong to the place saved on the card, so the
  server can't be made to fetch anything else, and only Google's photo host
  is ever downloaded from. At most 120 a person per 10 minutes.
- **Without a Google key,** nothing changes.
- **The code:** `fillPickedPlacePhoto` in `src/server/travel/place-photo.ts`,
  which also holds the photo code Maps links use.

## A place already on the trip

Tyler, 4 Nov 2026: "Skip it, say where". Adding a place the trip already has
is skipped, with a message such as "Kinkaku-ji is already on Day 2."

- **Two places are the same** when Google's id for them is the same. When
  either has no Google id, the names are compared, ignoring case and spaces:
  a card's place name, or its own name when it has no place.
- **Where it is checked:** Paste Maps links, a Maps link in New activity or
  in the Place section, picking a place from the search, Add from saved
  places, and Go again's Add to trip.
- **What doesn't count:** cards in the trip's bin, and the card being filled
  itself. A place typed by hand in the Place section is the person's own
  words, so it is never refused. Duplicate, Copy day and Copy trip copy on
  purpose and aren't checked.
- **Known gap:** two different places with the same typed name, such as two
  "Starbucks", count as one when neither came from Google.
- **The code:** `src/lib/travel/same-place.ts`, and `refuseSamePlace` in
  `src/server/travel/trips.ts`.

## Must do

Tyler, 4 Nov 2026: "Filter: Must do only", "AI plans around it", "Warn if
left in Ideas".

- **Setting it:** the Must do tick box in the ⋮ menu's Name and type section,
  whose summary then reads "Food · Must do", or Mark must do on a card's
  right-click.
- **On the card:** a filled flag after the name, never a star, so it can't be
  taken for a rating. Compact cards show it too.
- **Filter** has Must do, and a saved view keeps it.
- **AI:** Draft a plan and Fill this day are told every place already on the
  trip, Must do ones first, and never to plan them again. Fill this day is
  told which of the day's cards are Must do, and keeps them. Neither ever
  moves or changes a card.
- **Left in Ideas:** once a dated trip has started, a Must do card still in
  Ideas reads "Must do, not on a day yet" in red. A trip with no start date
  never warns.
- **Copies** keep it: Copy trip, Copy day and Duplicate.
- **Where it is kept:** `must_do` on `travel_activities`, migration
  `drizzle/0103_travel_must_do.sql`.

## Tips by AI

Tyler, 4 Nov 2026: "Into the card's notes".

- **Where:** Add tips in the card's ⋮ menu, under the line, before Duplicate.
  The menu stays open with "Writing tips…" while the AI answers.
- **What it writes:** three to five short tips, such as the best time to go,
  what to order, tickets or how long to allow, added after whatever the notes
  hold, under a "Tips" heading, as a list. The notes then show them, to change
  like anything else written there.
- **It never rewrites:** pressing it again adds a second Tips list.
- **What the AI is told:** the place's name and address, its type and the
  trip's destination, and never to invent prices, hours or phone numbers.
- **Limits:** the person's monthly AI allowance, and at most 30 a person per
  10 minutes. With no AI key it says AI isn't set up. An answer with fewer
  than three tips saves nothing and says to try again. Tips that would take
  the notes past 100,000 characters, the most a save takes, add nothing and
  say to shorten the notes.
- **The code:** `src/server/travel/place-tips.ts`.

## Saved places

Save to saved places copies the name, type, place, links, notes and picture.

The Saved places window has two tabs, Saved and Go again (Tyler, 4 Nov 2026:
"Tab in Saved places", "Ticked only"). Go again lists every place ticked
"Would go again" in its How was it section, on any of the person's trips not
in the Bin, newest trip first, each with its trip and day. Opened from a
trip's Ideas column, each has Add to trip, which copies it into Ideas the way
a saved place is copied, with no cost, rating or Done. Opened from the Trips
table, each has Open trip, which opens that trip on that card. The list is
`listGoAgain` in `src/server/travel/saved-places.ts`.
The Trips table's Saved places button lists them and removes one. The bookmark
on a trip's Ideas column adds one to that trip's Ideas. The copy is its own
from then on, so editing it never changes the saved place.

**Editing a saved place** (Tyler, 6 Nov 2026: "Opens in the window"): clicking
a saved place's name opens it inside the Saved places window, with Back to
saved places above it. Its name saves 700ms after the last letter, when it's
left or on Enter; an empty name is refused and stays as typed. Its type and
picture (an upload or Unsplash, with the credit) save the moment they're
picked, and its notes save themselves like any other note. The notes offer
Image, Video and Link blocks but not Place or Map, because a saved place
belongs to no trip; the server drops any that arrive. Copies already added to
a trip don't change. The server side is `updateSavedPlace` in
`saved-places.ts`, and the view is `saved-place-editor.tsx`.

## Where it lives

`src/components/travel/activity-panel.tsx`, `activity-notes.tsx`, `activity-photos-row.tsx`, `saving-document.tsx`,
`activity-menu.tsx` and the `activity-*-fields.tsx` sections it folds open.
Saving is `src/server/travel/trips.ts` (`updateActivity`), saved places
`saved-places.ts`.
