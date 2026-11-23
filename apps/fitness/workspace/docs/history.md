# History

History is a view on each program's dashboard: `/programs/<program>?view=history`. It lists the workouts logged in that program, newest first.

## The middle panel

Laid out as Tyler drew it on 18 Oct 2026:

- **Groups:** "This week", "Last week", then by month ("September 2026"), each heading with how many workouts it holds: "THIS WEEK · 1".
- **Each workout is a card:** a date tile (OCT over 18), the workout's name, then the day, how many sets were done and which lifts, and on wider screens the total lifted and the minutes as two small tags. An unfinished workout is marked Unfinished so it can be picked up again. A workout with no set ticked is never listed: there is nothing in it to look back on.
- Starting a workout happens on the Day view, not here: History is what was done.
- **Clicking a row** opens it on the right. On a phone that switches to the right panel's pill.
- **Arriving on History** with nothing open opens the newest workout the filters leave (`program-dashboard.md`).
- Workouts logged before workouts belonged to programs show in no program's history.

## The right panel

- **Nothing open:** the header says Workout, then an icon and "Click a workout to see its lifts and sets here.", and a Last four weeks card of four figures in a grid: workouts finished, sets done and total lifted in the last four weeks, and workouts all time.
- **A workout open:** the header holds its name, its day and an × that closes it. Under it, its summary (day, minutes, sets done, total lifted, the effort score and the note) and every lift with its done sets, "60 x 5, 60 x 5".
- **Coach notes:** a card under the summary with the notes a coach left on the workout, and each lift's notes under its sets. A coach writes them here. See `coach-notes.md`.
- **A Calisthenics workout** lists its sets as reps, "12, 12, 11 reps", and has no Total lifted (`calisthenics.md`).
- **Open** opens it in the middle panel to log or change it. **Do this again** starts a new workout in the same program with the same lifts and last time's weights as the targets, and opens it. **Delete** asks first; its sets leave the history, records and charts, and a calendar day it was on goes back to planned.

## A workout that isn't on the week

"Log an extra workout", in the Day view's actions menu, makes a workout in this program with no lifts and opens it, for a session done off the plan. It counts toward the weekly goal and the records like any other. It lived on History as "Start an empty workout" until 18 Oct 2026, when Tyler found the button and the empty row it left confusing and asked for it to move.

## Search, Filter and Views

Tyler took the first version's search box out on 18 Oct 2026, and on 20 Oct 2026 asked for search, Filter and Views back ("Add them"), the UI standard's tools for a middle panel that lists records. They sit in the middle header, left of the day's menu.

- **Search,** a magnifying glass that opens into a box, finds every word typed in the workout's name, its lifts or its note. "legs squat" finds a Legs day with squats. Escape empties it.
- **Filter** counts the filters set ("Filter 2") and holds a row each for Workout (one workout name, such as Chest day), Status (Finished or Unfinished) and Exercise (one lift), then Group: Week (This week, Last week, then the month, as before), Month, or None. Clear empties the three filters and leaves Group alone.
- **Save as view,** in Filter, names the search, filters and Group as they are now. **Views** lists the person's own views on this program, each with what it shows ("Legs · Unfinished · Group: Month"). Clicking one sets them all again. The bin beside a view deletes it.
- A view whose workout name or lift no longer appears in this program's History opens without that filter and says so in a toast.
- A coach's views are their own, and the person never sees them. A person has at most 30 views on one program.
- Everything is in the address (`q`, `name`, `status`, `exercise`, `group`), so a link opens the same list. Moving to another view empties them. A workout open on the right stays open while the filters still show it.
- Views are stored in `fitness_saved_views` (`drizzle/0100_fitness_saved_views.sql`): the person, the program, the name and the filters. The filters themselves are `src/lib/fitness/history-filters.ts`, the server side `src/server/fitness/saved-views.ts`.

## No import

The first version had an Import button that read Strong and Hevy exports. Tyler took it out on 18 Oct 2026. Workouts already imported before then stay, and count like any other.

Code: `src/components/fitness/history/history-views.tsx` and `workout-detail.tsx`.
