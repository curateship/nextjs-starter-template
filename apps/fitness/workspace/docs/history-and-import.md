# History and import

History is a view on each program's dashboard: `/programs/<program>?view=history`. It lists the workouts logged in that program, newest first.

## The middle panel

- **The toolbar:** search (by workout name, lift or note) and Import. A coach sees only the search. Starting a workout happens on the Day view, not here: History is what was done.
- **Each row:** the workout's name, the day, how many sets were done and which lifts, and on wider screens the total lifted and the minutes. An unfinished workout is marked Unfinished so it can be picked up again. A workout with no set ticked is never listed: there is nothing in it to look back on. One read from another app is marked Imported.
- **Clicking a row** opens it on the right. On a phone that switches to the right panel's tab.
- Workouts logged before workouts belonged to programs show in no program's history.

## The right panel

- **Nothing picked:** "Pick a workout to see it here." and this program's last four weeks: workouts finished, sets done, total lifted.
- **A workout picked:** its summary (day, minutes, sets done, total lifted, the effort score and the note) and every lift with its done sets, "60 x 5, 60 x 5".
- **Open** opens it in the middle panel to log or change it. **Do this again** starts a new workout in the same program with the same lifts and last time's weights as the targets, and opens it. **Delete** asks first; its sets leave the history, records and charts, and a calendar day it was on goes back to planned.

## A workout that isn't on the week

"Log an extra workout", in the Day view's actions menu, makes a workout in this program with no lifts and opens it, for a session done off the plan. It counts toward the weekly goal and the records like any other. It lived on History as "Start an empty workout" until 18 Oct 2026, when Tyler found the button and the empty row it left confusing and asked for it to move.

## Importing from Strong or Hevy

Import reads the export file from Strong or Hevy, two popular gym-logging apps, so old records and charts start full.

- Pick the `.csv` file. Older Strong files don't say kg or lb, so the window asks.
- The server reads it first and shows how many workouts and sets it holds, the dates it covers, and how many are already here.
- Every exercise name in the file gets a dropdown: the library lift it matches (filled in where the name is known, such as "Squat (Barbell)" for Back squat), or "Add as my own".
- Import saves every workout not already here **into this program**. A second import of the same file adds nothing, because each workout carries a key made from its app, start time and name.
- Only the program's owner can import into it.
- One file can add at most 300 lifts that aren't in the library. Past that it is refused with a sentence asking to match more names or import a shorter range. A person can preview or import 30 times an hour. The file itself can be at most 5 MB.
- **Not yet tried with real files:** the importer was written to the two apps' column names and tested on sample files built to match. A real export from each is still owed.

Code: `src/components/fitness/history/history-views.tsx`, `workout-detail.tsx`, `import-dialog.tsx`, and `src/server/fitness/import.ts`.
