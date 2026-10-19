# History

History is a view on each program's dashboard: `/programs/<program>?view=history`. It lists the workouts logged in that program, newest first.

## The middle panel

Laid out as Tyler drew it on 18 Oct 2026:

- **Groups:** "This week", "Last week", then by month ("September 2026"), each heading with how many workouts it holds: "THIS WEEK · 1".
- **Each workout is a card:** a date tile (OCT over 18), the workout's name, then the day, how many sets were done and which lifts, and on wider screens the total lifted and the minutes as two small tags. An unfinished workout is marked Unfinished so it can be picked up again. A workout with no set ticked is never listed: there is nothing in it to look back on.
- Starting a workout happens on the Day view, not here: History is what was done.
- **Clicking a row** opens it on the right. On a phone that switches to the right panel's tab.
- Workouts logged before workouts belonged to programs show in no program's history.

## The right panel

- **Nothing picked:** "Pick a workout to see it here." in a dashed box, and a Last four weeks card of four figures in a grid: workouts finished, sets done and total lifted in the last four weeks, and workouts all time.
- **A workout picked:** its summary (day, minutes, sets done, total lifted, the effort score and the note) and every lift with its done sets, "60 x 5, 60 x 5".
- **Open** opens it in the middle panel to log or change it. **Do this again** starts a new workout in the same program with the same lifts and last time's weights as the targets, and opens it. **Delete** asks first; its sets leave the history, records and charts, and a calendar day it was on goes back to planned.

## A workout that isn't on the week

"Log an extra workout", in the Day view's actions menu, makes a workout in this program with no lifts and opens it, for a session done off the plan. It counts toward the weekly goal and the records like any other. It lived on History as "Start an empty workout" until 18 Oct 2026, when Tyler found the button and the empty row it left confusing and asked for it to move.

## No import, no search

The first version had an Import button that read Strong and Hevy exports, and a search box. Tyler took both out on 18 Oct 2026, so History is the list alone. Workouts already imported before then stay, and count like any other.

Code: `src/components/fitness/history/history-views.tsx` and `workout-detail.tsx`.
