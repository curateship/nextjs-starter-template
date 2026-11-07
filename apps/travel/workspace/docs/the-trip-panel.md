# The trip's left panel

The trip's left panel shows the trip itself: the header, then the
description. The back arrow goes to Trips. Two icons sit in the header. The note icon opens the trip's notes, and the ⋮
opens Trip settings.

- **The cover photo** lies faintly behind the top of the panel, the way
  Project's banner does, with its Unsplash credit under the description. It is
  set in Trip settings → Cover photo, uploaded or from Unsplash, and shows as a
  small picture in the Trips table.
- **The description** sits under the header, written in place in the shell's
  editor, with its toolbar over selected words (task "Misc": "I want to also
  inline edit discription with tiptap editor"). It saves 700ms after the last
  letter and when it's left. It is the only place the description is
  written. Trip settings doesn't have it.
- **Lock blocks** in the ⋮ makes the description read only, its words and
  its blocks, until Unlock blocks (Tyler, 7 Nov 2026: "add lock blocks
  button"), as Project's Lock the notes does for a page. While it's locked
  nothing can be typed, no "/" list opens, the Budget field is turned off
  and blocks have no bins. It reads at full strength, not faded the way a
  note is with no signal (Tyler, 7 Nov 2026: "Why is there a shade overlay
  when the left panel is locked?"). The Budget block still folds and switches between
  By day and By type, since those change nothing on the trip. The server
  refuses a new description while it's locked, with "The trip's blocks are
  locked. Unlock them from the trip's ⋮ first." The trip's own notes behind
  the note icon aren't locked. The lock is `description_locked` on
  `travel_trips` (`drizzle/0108_travel_trip_blocks_lock.sql`), and Copy trip
  copies it.
- **Money** is the Budget block, put in the description, or any note on the
  trip, by typing "/" (Tyler, 7 Nov 2026: "turn this bottom card into a
  budget block"). It was a folding card in the panel's footer, so the panel
  has no footer now and the description takes all of it. The block is
  described in [Notes and the "/" blocks](notes-and-blocks.md). The budget
  itself is still the trip's own (`budget_cents` on `travel_trips`), so a
  trip keeps its budget without a block, and a trip with no block shows no
  money in the panel until one is added.

## Notes

The note icon, a notebook with a pen (Lucide's NotebookPen; Tyler, 3 Nov
2026: "replace the note icon with this NotebookPen"), shows the trip's notes
in the panel, and bends into an × that closes them, the way Project's inbox
icon does (Tyler, 2 Nov 2026: "Add a
note icon here I want to add archive of notes there. Notes use tiptap
editor"; then "Notes list in left panel"; 3 Nov 2026: "clicking on note
should then turn into an x icon to close with the morph animation").

- With no notes, the panel is one dashed area, Add a note, that makes the
  first one.
- With notes, they're listed by first line and the day each last changed,
  pinned notes first, then newest first, with a New note button under them.
- Right-click a note in the list for Pin (or Unpin), Duplicate and Delete
  (Tyler, 3 Nov 2026: "add right click feature to delete and duplicate note
  in the notes list").
- **Pinned notes** (Tyler, 6 Nov 2026: "Right-click, many pins") sit at the
  top of the list with an amber pin before their first line (Tyler, 6 Nov
  2026: "pinned icon should be ember", the rating stars' amber), newest change first
  among them. Any number can be pinned. Pinning doesn't change the day a note
  last changed. A duplicate starts unpinned; a note put back from the bin
  keeps its pin. The pin is `pinned_at` on `travel_trip_notes`.
- **Delete puts a note in the trip's bin** (Tyler, 6 Nov 2026: "Same Bin as
  cards"), with Undo on the bar at the bottom for 6 seconds, so it no longer
  asks first. The note waits 30 days in the same Bin as deleted cards (the
  ⋮ after the board's tabs), listed as "Note", with Put back and Delete for
  good (which asks on the row first), then goes for good the next time the
  Bin opens after 30 days. A binned note isn't in
  the list or the Photos tab, can't be written in, and doesn't count toward
  the 200. Putting one back when the trip already holds 200 is refused. The
  bin is `deleted_at` on `travel_trip_notes`
  (`drizzle/0107_travel_trip_note_bin_and_pin.sql`).
- A new note opens with the cursor in it. A note is written in the shell's
  editor and saves itself. Back to notes, right under the note, goes back to
  the list (Tyler, 3 Nov 2026).
- The header keeps the trip's name and its back arrow to Trips while the
  notes are open (Tyler, 3 Nov 2026: "we dont need notes with back arrow").
- At most 200 notes a trip, not counting the bin. They live in
  `travel_trip_notes`, one row each, the editor's document as JSON text. The
  server side is `src/server/travel/trip-notes.ts`.

## What went

Tyler removed these on 2 Nov 2026, with their tables
(`drizzle/0099_travel_remove_booking_and_journal.sql` and
`drizzle/0100_travel_misc.sql`): the journal, the packing list, Before you go,
the emergency card, the trip's documents, the card holding the trip's name,
destination and dates, and the sample trip's own note with Delete sample. The
sample trip is deleted like any other trip, from the Trips table or Trip
settings.

## Trip settings

The ⋮ at the top of the panel opens Trip settings as a dropdown, not a
window (Tyler, 3 Nov 2026: "change this to 3 vertical dot and isntead of
modal, make it into a dropdown"). It opens to the right of the ⋮, over the
board, not over the left menu ("dropdown to appear aligned right side").

Since 6 Nov 2026 it is the tabbed ⋮ of the Admin 3 panel design, the same
menu as Project's project ⋮ (Tyler: "Look at the serttings dropdown, its not
ui standard for example. fix them all"). Before, it was one folding row per
setting.

- **Its shape:** 20.4rem wide, never past the screen less 2rem. One
  underlined tab, General, since a trip has nothing for a second tab. It
  opens on General every time.
- **General is grouped rows.** A small grey heading, then one bordered list
  with a line between rows. The rows are light grey, darker while pointed at
  or open (Tyler, 6 Nov 2026: "make this bg light gray"). Each row is the name
  on the left, muted, what it holds on the right, and an arrow. An empty value
  reads "None" in grey.
  - **Trip:** Name, Destination, Tags and Cover photo. Each opens a small box
    with its field, the cursor already in it.
  - **Dates:** Start date opens the month at once, with "No dates yet" under
    it to clear the dates. Time zone opens the zones at once, with a search
    box over them ("tok" finds Asia/Tokyo, Enter takes the first match).
  - **Details:** Status, Currency and Getting around (walk, transit or drive,
    used for travel times). Each drops its choices from the row, the current
    one ticked, and one press picks and saves.
- **Under the groups:** Rate the trip, Lock blocks (Unlock blocks while
  locked), then Delete trip in red under a line of its own.
- **Saving:** every field saves itself. There is no Save button. An empty
  name is refused with "Give the trip a name." Closing the menu leaves the
  field being typed in first, so its save lands.
- **Escape** inside a row's box or list closes that box and leaves the menu
  open. Using a box opened from inside, such as the media library or
  Unsplash, doesn't close the menu.
- Tags go in with a comma between them and filter the Trips table.
- Delete trip moves the trip to the Trips table's Bin with Undo, then goes
  back to Trips (see [Trips and the trip page](trips-and-the-trip-page.md)).
- The number of days changes on the board.
- With no start date, the Calendar tab has its own date picker that saves
  the start date.

## Where it lives

`src/components/travel/trip-details-panel.tsx`, `trip-notes-panel.tsx`,
`saving-document.tsx` and `trip-menu.tsx`. The menu
is `TabbedMenu` (`tabbed-menu.tsx`) with `PickGroup` and the row kinds in
`pick-rows.tsx`, copied from Project's `my-settings-menu.tsx` and
`pick-rows.tsx`. The gutters are in `src/lib/travel/panel-gutter.ts`.
Notes are `src/server/travel/trip-notes.ts`. The Budget block is
`trip-budget-card.tsx`, its totals `src/lib/travel/budget.ts`.
