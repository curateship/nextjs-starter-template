# The trip's left panel

The trip's left panel shows the trip itself. The back arrow goes to Trips. Two
icons sit in the header: the note icon opens the trip's notes, and the cog
opens Trip settings.

- **The cover photo** lies faintly behind the top of the panel, the way
  Project's banner does, with its Unsplash credit under the description. It is
  set in Trip settings → Pictures, uploaded or from Unsplash, and shows as a
  small picture in the Trips table.
- **The description** sits under the header, written in place in the shell's
  editor, with its toolbar over selected words (task "Misc": "I want to also
  inline edit discription with tiptap editor"). It saves 700ms after the last
  letter and when it's left. Trip settings has the same description field, and
  a save there redraws it here.
- **Money:** the total of every cost on the trip's days against the budget
  typed here, with a bar that turns red over budget, then a line per day.
  Costs in Ideas are listed apart and not counted. A stay counts once, on its
  first day.

## Notes

The note icon shows the trip's notes in the panel, and bends into an × that
closes them, the way Project's inbox icon does (Tyler, 2 Nov 2026: "Add a
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

The name, description, destination, tags, status, start date, time zone,
currency, how to get around (walk, transit or drive, used for travel times),
the cover photo, shown small as Project's banner is, and Delete trip. Tags go
in with a comma between them and filter the Trips table. The number of days
changes on the board.

## Where it lives

`src/components/travel/trip-details-panel.tsx`, `trip-notes-panel.tsx`,
`trip-budget-card.tsx`, `saving-document.tsx` and `trip-settings-dialog.tsx`.
Notes are `src/server/travel/trip-notes.ts`, the totals
`src/lib/travel/budget.ts`.
