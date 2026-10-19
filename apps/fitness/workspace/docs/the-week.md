# The week

A program is one fixed week. Each weekday, Monday to Sunday, is either a workout with a name and its exercises, or a rest day. Tyler chose this on 18 Oct 2026 over the first version's rotating "Day A, Day B across your training weekdays", which he found confusing. Monday Push, Wednesday Pull, Friday Legs means Push every Monday, Pull every Wednesday and Legs every Friday, week after week.

## Where it lives

Tyler redrew all of this on 18 Oct 2026, and the screens follow his drawings.

- **Left panel, This week:** first two figures side by side. Workouts is "1 / 3", this week's workouts against the weekly goal in Settings, App settings, with a bar under it. Streak is "4 weeks in a row". Both count only this program's workouts, and skip only the weeks this program was paused. Under them the week, Monday first: the weekday, a dot, the workout's name or "Rest", and a word at the right. The dot is green when done, amber when missed, dark for today, and an empty ring when planned or resting. The word says Done, Missed, Paused or Today, so the dot is never the only sign. The picked day sits on a white row. Picking a day opens it in the middle.
- **Middle, Day view:** the picked weekday's workout as a large heading, "Chest day". Under it: "Sunday · Today · 3 exercises · 9 sets · about 25 min", where the minutes allow 45 seconds a set, the rest between sets and a minute between exercises, rounded to 5. Add exercise sits at its right, and offers only the lifts of the program's routine type. The day's menu (three dots) and Start workout sit up in the row with the tabs. The exercises are cards in order. Each card has a drag handle, its number, the name, "Rest 3 min · Last: 3 × 5 on Oct 11" (or "Not logged yet"), the sets and reps, and the weight: "80 kg", "+10 kg" on a bodyweight lift, "Bodyweight", or "No weight" in amber when none is set. A superset says "Superset: no rest until the last one" above its first card. Clicking a card opens it on the right, with a dark outline on the card.
- **Right panel:** the picked exercise. See below.

## Making the week

- **A rest day** says so, with a name box and "Make it a workout day". It can also "Use a template" or "Build with AI", both of which set the whole week at once and replace it.
- **A workout day's actions** (the three dots): Rename this workout, Copy to another weekday (the copy has the same exercises, sets, reps and weights, and from then on each day keeps its own), Make it a rest day (asks first; its exercises go and its planned dates leave the calendar, logged workouts stay), and the template and AI choices.
- **Templates** each set fixed weekdays: 5x5 is Monday A, Wednesday B, Friday A. Push Pull Legs is Monday, Wednesday, Friday. Upper Lower is Monday and Thursday upper, Tuesday and Friday lower. Each heavy lift starts at 75 out of 100 of the best lift in Starting data, or empty when none was given.
- **The AI** writes one workout per weekday from the goal, experience and equipment in Starting data, using only library lifts. A beginner gets at most four days and five lifts a day. The draft is read first; nothing changes until "Use this week".

## The picked exercise

The right panel shows the exercise's name and its day, then:

- **Sets and weight:** sets and reps with minus and plus buttons; weight in the unit from Settings, App settings, with the unit written in the box ("Added weight" for a pull-up or dip, which is only what hangs from the belt; "Leave at 0 for bodyweight or assisted" under the plain one); and rest between sets as four choices, 1 min, 1:30, 2 min or 3 min, whose raised part slides across like the tabs. A rest set to anything else before then shows "4 min now. Pick one to change it." Each saves as it changes, with no Saved word beside the heading (Tyler took it out on 18 Oct 2026); a save that fails says so in a toast.
- **Join with the one above:** makes it a superset with the exercise above it. Taking one out of the middle of a group splits the group, so the ends never stay joined.
- **Next time:** the weight rules as numbers for this exercise, a row each: a green up arrow, "Hit all 3 sets of 5", 65 kg; an amber down arrow, "Miss reps 3 sessions in a row", 57.5 kg. Or that automatic changes are off.
- **Swap exercise** and **Remove** side by side at the foot. Swap keeps the sets, reps, weight and rest and changes the lift; Remove, in red, asks first.

With nothing picked, the right panel says what to pick. The program's own settings (Starting data, Weight rules and Training blocks) live in the cog on the banner (`program-dashboard.md`).

## Starting a workout

Start workout on the Day view opens the workout in the middle panel of the same dashboard (`?workout=<id>`), never on a page of its own.

- On today's weekday it logs against today's calendar date, so the calendar marks it Done. A workout already started today opens again ("Carry on") rather than starting twice.
- On any other weekday it logs that day's workout as done today. That is how a workout is done early or made up.
- An unfinished workout of this program with at least one set ticked shows "Pick up <workout>" at the top of the left panel. A workout left open in another program stays in that program's dashboard.
- "Log an extra workout" in the Day view's actions menu starts a workout that isn't on the week, with no lifts, for a session done off the plan.
- A workout left with no set ticked is thrown away when you go back to the week, so starting one by mistake leaves nothing behind.
- A coach looking at a client's program sees no Start: only the person who trains logs a workout.

## The calendar

The Calendar view repeats the week through the month, four weeks ahead at a time, laid out as Tyler drew it on 18 Oct 2026. The month's name is large between its arrows, with Today beside it and a key at the right: Done, Missed, Planned, and Paused when the month has any. The grid has MON to SUN across the top, and days outside the month are greyed. Each workout is a small card with a dot in the same colours as the week: green done, amber missed (its name greyed), an empty ring planned, and dark for today, whose card also has a dark outline. A feather marks a light week. Each card's full name and status are read out to a screen reader. On a narrow panel the month is a list of cards, each with its status in words. At 1440 wide with all three panels open, long names are cut short; widening the middle panel shows them whole. Picking a date opens it on the right with "Start this workout", "Open workout" for one already logged, and "Move to another day". A planned date can also be dragged onto another date. A moved date stays where it was put; the rest of the week is untouched. Changing which weekdays are workouts lays the calendar out again from today, with three things it never touches:

- **A date with a workout on it.** A finished one stays Done, and one started but not finished keeps its date, so finishing it still marks that day.
- **A moved workout.** It stays on the date it was moved to, and the date it left stays empty: the week is never laid back onto it (`moved_from` on `fitness_scheduled_workouts`).
- **History.** Making a weekday a rest day, or replacing the week with a template or the AI, keeps that weekday's finished dates, named after the workout that was done (`drizzle/0098_fitness_calendar_keeps_history.sql`). Its dates still to come, and its missed dates, leave the calendar.

A pause (Pause program in the cog) takes its dates off the calendar: no missed days, no reminders, no weight drops. Resume puts the week back from today.

## Code

`src/components/fitness/program/week-views.tsx` (left panel, Day view, right panel), `day-exercise-panel.tsx`, `calendar-views.tsx`, `program-calendar.tsx`, `calendar-day-card.tsx`, `start-workout.ts`, `this-week.ts`; server `src/server/fitness/week.ts` and `src/server/fitness/calendar.ts`; tables `fitness_week_days` (one row per workout weekday) and `fitness_day_exercises`.
