# The trip's left panel

The trip's left panel shows the trip itself. The back arrow goes to Trips. Two
icons sit in the header. The note icon opens the trip's notes, and the ⋮
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
- **Money:** the total of every cost on the trip's days against the budget
  typed here, with a bar that turns red over budget, then a line per day.
  Costs in Ideas are listed apart and not counted. A stay counts once, on its
  first day.

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
  newest first, with a New note button under them.
- Right-click a note in the list for Duplicate and Delete; Delete asks first
  (Tyler, 3 Nov 2026: "add right click feature to delete and duplicate note
  in the notes list").
- A new note opens with the cursor in it. A note is written in the shell's
  editor and saves itself. Back to notes, right under the note, goes back to
  the list (Tyler, 3 Nov 2026).
- The header keeps the trip's name and its back arrow to Trips while the
  notes are open (Tyler, 3 Nov 2026: "we dont need notes with back arrow").
- At most 200 notes a trip. They live in `travel_trip_notes`, one row each,
  the editor's document as JSON text.

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
modal, make it into a dropdown and using the same ui and spacing as the
previous dropdown"). It opens to the right of the ⋮, over the board, not over
the left menu ("dropdown to appear aligned right side").

- It is the same menu as an activity's ⋮ (see [Activities](activities.md)):
  294px wide, folding rows with no lines between them, one line, then Delete
  trip in red.
- The rows are Name, Destination, Tags, Status, Start date, Time zone,
  Currency, Getting around (walk, transit or drive, used for travel times)
  and Cover photo. Each shows what it holds now on the right and folds open
  to change it.
- Every field saves itself, the way an activity's do. There is no Save
  button. An empty name is refused with "Give the trip a name."
- Tags go in with a comma between them and filter the Trips table.
- The cover photo is uploaded or picked from Unsplash.
- Delete trip moves the trip to the Trips table's Bin with Undo, then goes
  back to Trips (see [Trips and the trip page](trips-and-the-trip-page.md)).
- The number of days changes on the board.
- With no start date, the Calendar tab has its own date picker that saves
  the start date.

## Where it lives

`src/components/travel/trip-details-panel.tsx`, `trip-notes-panel.tsx`,
`trip-budget-card.tsx`, `saving-document.tsx` and `trip-menu.tsx`, which is
built from `folding-menu.tsx`, the same pieces as an activity's ⋮ menu.
Notes are `src/server/travel/trip-notes.ts`, the totals
`src/lib/travel/budget.ts`.
