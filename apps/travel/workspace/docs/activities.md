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
allow (`src/lib/travel/notes.ts`). Anything that isn't such a document is
saved as no notes.

## The ⋮ menu

Tyler, 2 Nov 2026: "All of these are collapsible cards in a 3 dot dropdown ...
and move delete there too." The ⋮ in the panel's header opens a menu drawn like
the ⋮ on a task in Project. Each row shows what it holds now on the right and
folds open to change it. Every field saves itself.

- **Name and type.**
- **When:** the day (Ideas or Day N), start time, length in hours and minutes,
  and nights for a stay. Nights shows for a Hotel or anything with nights set.
  Moving to another day can be undone from the bar at the bottom.
- **Place:** a Google Maps link first (see below), then a search for the
  address. With Google on, picking a suggestion
  saves the place and fills its opening hours, website and phone. A typed
  place keeps what was there. "Open in Google Maps" opens it in a new tab.
  Opening hours can be typed by hand, a day at a time, with Closed. A start
  time outside the hours warns, such as "Closed at 6:00 PM on Tuesdays";
  with no start date the weekday isn't known, so it doesn't warn. Website and
  Menu open in a new tab, and Phone has a Call button.
- **Cost:** in the trip's currency, added up in the trip's Money card.
- **Picture:** upload one, or search Unsplash. An Unsplash photo shows its
  photographer's credit.
- **How was it:** once the activity is done or its day is over, 1 to 5 stars,
  "Would go again", and Save to saved places.
- **Duplicate activity** and **Delete activity** end the menu. Delete moves it
  to the trip's bin, with Undo. Delete is red.

The menu is drawn like Project's task menu (Tyler, 3 Nov 2026, from two
pictures of it: "the items dont have dividers except the divider that
seperate the delete"; then "duplicate goes here", with an arrow under the
line). Its rows have no lines between them. The one line runs edge to edge
under the last folding row, and Duplicate activity and Delete activity sit
under it. Every row is 32px tall, and the rows touch with no gap between
them ("reduce space between items a bit").

Trip settings (the ⋮ in the trip's left panel), the schedule's "+ Add" and
the ⋮ after its tabs are the same menu, built from the same file,
the shell's `src/components/shared/folding-menu.tsx` (Tyler, 3 Nov 2026: "every time you created a dropdown,
you made something different so all of the dropdown has slightly different
ui"). A menu of actions alone, such as "+ Add", is as wide as its longest
row ("Too much space here").

The menu is 294px wide. That is Project's 363px task menu made 10% narrower
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
  New activity the activity is still made, and opens to be filled by hand.
- **The code:** `src/server/travel/maps-link.ts` and `maps-browser.ts`.

## No bookings

Tyler removed the booking feature on 2 Nov 2026. An activity has no Booked or
To book mark, confirmation number, booking link or files of its own; only the
cost stayed. The columns went in
`drizzle/0099_travel_remove_booking_and_journal.sql`. The trip's own documents
are still on the left panel.

## Saved places

Save to saved places copies the name, type, place, links, notes and picture.
The Trips table's Saved places button lists them and removes one. The bookmark
on a trip's Ideas column adds one to that trip's Ideas. The copy is its own
from then on, so editing it never changes the saved place.

## Where it lives

`src/components/travel/activity-panel.tsx`, `activity-notes.tsx`, `saving-document.tsx`,
`activity-menu.tsx` and the `activity-*-fields.tsx` sections it folds open.
Saving is `src/server/travel/trips.ts` (`updateActivity`), saved places
`saved-places.ts`.
