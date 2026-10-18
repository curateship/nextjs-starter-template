# The Programs dashboard

Everything in Fitness starts on the Programs dashboard at `/programs`, first in the left menu. Tyler set the flow on 18 Oct 2026: "There is a program dashboard. I create a program via modal, choose a routine, input my starting data then create. Only then I get to the 3 panel dashboard."

## Words

- **A program** is what a person makes and names, like a project: "Summer strength". Each one is one week of training, Monday to Sunday.
- **A routine** is the program's type: Strength training today. Calisthenics, Running and Mobility show as "Coming soon" and can't be picked yet.

## The table

- **One row per program**, the person's active one marked Active, and Paused or Archived when they are.
- **Columns:** the name (opens that program's own three-panel dashboard at `/programs/<id>`), the routine type, the next workout on its calendar ("Push, Mon, Oct 19", or "Nothing planned yet"), and how many of the seven days are workouts.
- **Actions:** the cog renames a program, makes it the active one or archives it. The bin deletes it after asking. Ticking rows and pressing Delete removes several at once, in one request; if any could not be deleted, the message says how many.
- **Deleting a program** removes its week, calendar and rules for good. Workouts already logged stay and keep counting toward records.
- On a phone, the next workout moves under the name and the other columns hide.

## New program

New program opens one window with everything the program needs on day one:

- **Program:** its name and its routine type.
- **Starting data:** bodyweight, height, chest, waist, hips, arm and thigh, the goal and how long the person has lifted. All of it can stay empty and be filled in later.
- **Equipment you have:** one tick box per item. Swaps and the AI plan only offer lifts that need this equipment. None ticked allows everything.
- **Best lifts:** a dropdown lists only the chosen routine type's exercises. Each lift takes a weight and reps, and shows the one-rep max it works out to as it is typed: 100 kg for 5 is about 116.7 kg once. Templates start each lift from it.

Create program saves all of it at once and opens the new program's dashboard, where the week is planned. Nothing is saved until Create is pressed; closing a window with typing in it asks first.

## Above the table

Only when there is something to say:

- **Unfinished workout:** a workout started, with at least one set ticked, and never finished, with "Pick up" opening it inside its program. A workout with nothing ticked is never offered (Tyler, 18 Oct 2026), and one left that way for six hours is cleared away the next time this dashboard or its program opens (`discardUntouchedWorkouts` in `src/server/fitness/workouts.ts`).
- **Coach requests:** a coach asking to coach the person, with Accept and Decline. See `coaching.md`.
- **My coaches** (under the table): each coach the person said yes to, a switch for whether they may see the before and after photos, and Remove.
- **Clients** (under the table, coaches only): see `coaching.md`.

## The person's clock

The calendar, "today" and reminders run on each person's own time zone, which only their browser knows. The Programs dashboard sends it once when it differs from what the server holds. It is not a setting anyone types.
