# Exercise library

Exercises is a dashboard of its own at `/exercises`, in the left menu as Exercises. Tyler, 18 Oct 2026: "Excicses has its own dashboard and filtered by routine type. The program only list excercises that are related to it."

## Routine types

- Every lift belongs to one routine type, such as Strength training (`fitness_exercises.routine_type`).
- The dashboard opens on Strength training. The Routine type filter switches to another type, and the address keeps it as `?type=`.
- A program only offers lifts of its own routine type: its week, its starting data and its workout logger all ask the server for that type alone (`listExercises(userId, db, routineType)` in `src/server/fitness/exercises.ts`). Swaps in the logger stay inside the type too. The server holds the same line: adding a lift of another type to a week, a starting lift or a workout is refused (`exerciseForRoutine`).
- Strength training and Calisthenics have built-in lifts. Running and Mobility show "No running exercises yet" until somebody adds one.

## Built-in lifts

- Calisthenics' built-in moves sit in ladders, each naming its next harder version, and a hold is logged in seconds. Their window shows "Counts: Reps, no weight" and the harder version. See `calisthenics.md`.
- They are written once, in `src/lib/fitness/exercise-catalog.ts`, each with a stable slug, its muscles (main one first), its equipment and its movement (push, pull, squat, hinge, lunge, carry, core or single muscle). All of them are Strength training. A lift's body part (Chest, Back, Shoulders, Arms, Core, Legs or Other), which the Day view groups by, comes from its main muscle, so your own lifts get one from the muscles you pick.
- The server copies that list into `fitness_exercises` the first time anything asks for the library, matched by slug, so plans and logged sets point at one row however a name is later spelled.
- Nobody can change or delete a built-in lift. Someone who wants a different one adds their own.

## The table

- Columns: Name with Yours and Painful badges, Routine type, Main muscle, Equipment and Movement. Every column sorts. On a phone, Name stays and the others step back as the screen narrows.
- The toolbar holds, in order: Delete for ticked rows, search by name, the Routine type, Muscle and Equipment filters, and New exercise.
- Only a person's own lifts can be ticked, because built-in lifts can't be deleted. Deleting several is one request; a lift with logged sets is kept, and the message says how many went and how many stayed.
- 25 rows a page.

## The exercise window

Clicking a row (or its cog) opens the lift in a window and puts `?open=<id>` in the address, so a link opens the same lift and Back closes it.

- **A built-in lift** shows its muscles, equipment, movement and how its weight is counted, with a Done button.
- **One of your own** shows its fields: name, routine type, muscles, equipment, movement, a bodyweight-lift switch (a "Logged in seconds" switch for a Calisthenics move instead) and an optional picture. Save changes saves them; Delete removes the lift after asking. A lift with logged sets can't be deleted, because its history would go with it.
- **New exercise** opens the same window empty, with the routine type the table is filtered to already picked. Once made, the new lift opens in the window.
- The picture uses the shell's normal picture picker, because a picture of how a lift is done is not private, unlike before and after photos. It must be one of the person's own uploads, the same rule as a profile photo, so a lift never shows an outside address that could tell someone when it was looked at.

## Painful lifts

Every lift's window has a Painful lift section. Marking a lift painful, with a note on what hurts, stops swaps in the workout logger offering it until the mark comes off. The switch saves the moment it is pressed and the note when its field is left, because marking a lift is its own act, separate from Save changes. The table and the shared exercise picker show a "Painful" badge rather than hiding the lift.

## Where it lives

- `src/routes/_authenticated/exercises.tsx`
- `src/components/fitness/exercises/exercises-dashboard.tsx`, `exercise-dialog.tsx`, `exercise-fields.tsx`, `exercise-draft.ts`
- `src/server/fitness/exercises.ts`, `src/lib/api/fitness/exercises.ts`
- Tables `fitness_exercises` and `fitness_avoided_exercises`
