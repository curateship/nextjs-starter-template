# The week

A program is one fixed week. Each weekday, Monday to Sunday, is either a workout with a name and its exercises, or a rest day. Tyler chose this on 18 Oct 2026 over the first version's rotating "Day A, Day B across your training weekdays", which he found confusing. Monday Push, Wednesday Pull, Friday Legs means Push every Monday, Pull every Wednesday and Legs every Friday, week after week.

## Where it lives

- **Left panel:** the week, Monday first. Each row says the weekday, the workout's name or "Rest", "Today" on today's weekday, and this week's status for that date when it isn't simply planned: Done, Missed or Paused, each as an icon and a word. Picking a row opens that day in the middle. Under the list: "2 of 3 workouts this week · 4 weeks in a row", from the weekly goal in Settings, App settings. It counts only this program's workouts, and skips only the weeks this program was paused.
- **Middle, Day view:** the picked weekday. The toolbar reads "Wednesday · Pull" with the day's actions and Start workout. The exercises are listed in order, one compact row each: "5 x 5 · 80 kg · rest 3 min". A handle drags a row to reorder, and a superset is marked with a line down the left and "Superset: no rest until the last one". Clicking a row opens it on the right. Add exercise offers only the lifts of the program's routine type.
- **Right panel:** the picked exercise. See below.

## Making the week

- **A rest day** says so, with a name box and "Make it a workout day". It can also "Use a template" or "Build with AI", both of which set the whole week at once and replace it.
- **A workout day's actions** (the three dots): Rename this workout, Copy to another weekday (the copy has the same exercises, sets, reps and weights, and from then on each day keeps its own), Make it a rest day (asks first; its exercises go and its planned dates leave the calendar, logged workouts stay), and the template and AI choices.
- **Templates** each set fixed weekdays: 5x5 is Monday A, Wednesday B, Friday A. Push Pull Legs is Monday, Wednesday, Friday. Upper Lower is Monday and Thursday upper, Tuesday and Friday lower. Each heavy lift starts at 75 out of 100 of the best lift in Starting data, or empty when none was given.
- **The AI** writes one workout per weekday from the goal, experience and equipment in Starting data, using only library lifts. A beginner gets at most four days and five lifts a day. The draft is read first; nothing changes until "Use this week".

## The picked exercise

The right panel shows the exercise's name and its day, then:

- **Sets and weight:** sets, reps, weight in the unit from Settings, App settings ("Added weight" for a pull-up or dip, which is only what hangs from the belt), and rest in seconds. Each saves as it changes.
- **Join with the one above:** makes it a superset with the exercise above it. Taking one out of the middle of a group splits the group, so the ends never stay joined.
- **Next time:** the weight rules as numbers for this exercise ("Hit all 3 sets of 5 and it goes to 65 kg. Miss reps 3 sessions in a row and it drops to 57.5 kg"), or that automatic changes are off.
- **Swap exercise** keeps the sets, reps, weight and rest and changes the lift. **Remove** asks first.

With nothing picked, the right panel says what to pick. The program's own settings (Starting data, Weight rules and Training blocks) live in the cog beside its name (`program-dashboard.md`).

## Starting a workout

Start workout on the Day view opens the workout in the middle panel of the same dashboard (`?workout=<id>`), never on a page of its own.

- On today's weekday it logs against today's calendar date, so the calendar marks it Done. A workout already started today opens again ("Carry on") rather than starting twice.
- On any other weekday it logs that day's workout as done today. That is how a workout is done early or made up.
- An unfinished workout of this program with at least one set ticked shows "Pick up <workout>" at the top of the left panel. A workout left open in another program stays in that program's dashboard.
- "Log an extra workout" in the Day view's actions menu starts a workout that isn't on the week, with no lifts, for a session done off the plan.
- A workout left with no set ticked is thrown away when you go back to the week, so starting one by mistake leaves nothing behind.
- A coach looking at a client's program sees no Start: only the person who trains logs a workout.

## The calendar

The Calendar view repeats the week through the month, four weeks ahead at a time. Each date shows the workout and its status: Planned, Done, Missed (a planned date in the past with nothing logged) or Paused, plus "Light" in a light week, each as an icon and a word. Picking a date opens it on the right with "Start this workout", "Open workout" for one already logged, and "Move to another day". A planned date can also be dragged onto another date. A moved date stays where it was put; the rest of the week is untouched. Changing which weekdays are workouts lays the calendar out again from today, with three things it never touches:

- **A date with a workout on it.** A finished one stays Done, and one started but not finished keeps its date, so finishing it still marks that day.
- **A moved workout.** It stays on the date it was moved to, and the date it left stays empty: the week is never laid back onto it (`moved_from` on `fitness_scheduled_workouts`).
- **History.** Making a weekday a rest day, or replacing the week with a template or the AI, keeps that weekday's finished dates, named after the workout that was done (`drizzle/0098_fitness_calendar_keeps_history.sql`). Its dates still to come, and its missed dates, leave the calendar.

A pause (the program's actions in the left panel) takes its dates off the calendar: no missed days, no reminders, no weight drops. Resume puts the week back from today.

## Code

`src/components/fitness/program/week-views.tsx` (left panel, Day view, right panel), `day-exercise-panel.tsx`, `calendar-views.tsx`, `program-calendar.tsx`, `calendar-day-card.tsx`, `start-workout.ts`, `this-week.ts`; server `src/server/fitness/week.ts` and `src/server/fitness/calendar.ts`; tables `fitness_week_days` (one row per workout weekday) and `fitness_day_exercises`.
