# The week

A program is one fixed week. Each weekday, Monday to Sunday, is either a workout with a name and its exercises, or a rest day. Tyler chose this on 18 Oct 2026 over the first version's rotating "Day A, Day B across your training weekdays", which he found confusing. Monday Push, Wednesday Pull, Friday Legs means Push every Monday, Pull every Wednesday and Legs every Friday, week after week.

## Where it lives

Tyler redrew all of this on 18 Oct 2026, and the screens follow his drawings.

- **Left panel, This week:** first two figures side by side. Workouts is "1 / 3", this week's workouts against the weekly goal in Settings, App settings, with a bar under it. Streak is "4 weeks in a row". Both count only this program's workouts, and skip only the weeks this program was paused. Under them the week, Monday first: the weekday, a dot, the workout's name or "Rest", and a word at the right. The dot is green when done, amber when missed, dark for today, and an empty ring when planned or resting. The word says Done, Missed, Paused or Today, so the dot is never the only sign. The picked day sits on a white row. Picking a day opens it in the middle.
- **Middle, Day view,** as Tyler drew it on 20 Oct 2026. The picked weekday's workout as a large heading, "Push and Pull", and under it the date it falls on this week, how many exercises and how many sets: "Tue, Oct 20 · 7 exercises · 24 sets". Then the exercises run edge to edge under grey body part headings with their count, "Chest · 2", in the order each body part first comes in the day.
  - **Each row:** a drag handle, its number (filled in dark while it is open on the right), the name, "Rest 3 min · Last: 60 kg × 8" (last session's best set, or "Not logged yet"), and the working sets ticked in this week's workout for the day, "0/4 sets". A lift in a superset says "Superset" before its rest.
  - **Body parts** come from each lift's main muscle, the first in its list: chest is Chest; upper back, lats, traps and lower back are Back; shoulders are Shoulders; biceps, triceps and forearms are Arms; abs are Core; glutes, quads, hamstrings and calves are Legs; a lift with no muscle is Other. Nobody types a body part in (`bodyPartOf` in `src/lib/fitness/exercise-catalog.ts`).
  - **The "+" on a body part's heading** shows while the heading is pointed at (always on a phone). It opens New exercise listing only that body part's lifts, with only its muscles in the muscle choice. The new lift joins the end of its body part.
  - **A bodyweight lift** with nothing added reads "Last: bodyweight × 8".
  - **Dragging** moves a lift within its body part only, since where it sits doesn't change its body part. The server keeps every day in that order (`settleDayOrder` in `src/server/fitness/week.ts`, the rule in `src/lib/fitness/day-order.ts`): after a new lift, a swap, a drag, a superset, a copied day, a template or the AI week, and again just before a workout starts. So the numbers on the Day view, the right panel's "Exercise 1 of 3" and the workout always agree, and a day saved before 20 Oct 2026 in another order is put right the first time it is touched.
  - **A superset stays together,** filed under its first lift's body part: a bench press and row superset sits under Chest, and its rest still comes after the last of them. "Join with the one above" joins the lift shown above.
  - **New exercise,** in the middle header, opens a dropdown with the lift (only the lifts of the program's routine type), sets and reps, weight and rest, and Create exercise; a lift picked fills in the usual reps and rest for its kind. The day's menu (three dots) and Start workout sit in the same header. Clicking a row opens it on the right.
- **Right panel:** the picked exercise. See below.

## Making the week

- **A rest day** says so. New workout, in the middle header, names the workout and makes it a workout day. The rest day can also "Use a template" or "Build with AI", both of which set the whole week at once and replace it.
- **A workout day's actions** (the three dots): Rename this workout, Copy to another weekday (the copy has the same exercises, sets, reps and weights, and from then on each day keeps its own), Make it a rest day (asks first; its exercises go and its planned dates leave the calendar, logged workouts stay), and the template and AI choices.
- **Templates** each set fixed weekdays: 5x5 is Monday A, Wednesday B, Friday A. Push Pull Legs is Monday, Wednesday, Friday. Upper Lower is Monday and Thursday upper, Tuesday and Friday lower. Each heavy lift starts at 75 out of 100 of the best lift in Starting data, or empty when none was given.
- **The AI** writes one workout per weekday from the goal, experience and equipment in Starting data, using only library lifts. A beginner gets at most four days and five lifts a day. The draft is read first; nothing changes until "Use this week".

## The picked exercise

The right panel shows the exercise's name and its day, then:

- **Sets and weight:** sets and reps with minus and plus buttons; weight in the unit from Settings, App settings, with the unit written in the box ("Added weight" for a pull-up or dip, which is only what hangs from the belt; "Leave at 0 for bodyweight or assisted" under the plain one); and rest between sets as four choices, 1 min, 1:30, 2 min or 3 min, whose raised part slides across like the tabs. A rest set to anything else before then shows "4 min now. Pick one to change it." Each saves as it changes, with no Saved word beside the heading (Tyler took it out on 18 Oct 2026); a save that fails says so in a toast.
- **Join with the one above:** makes it a superset with the exercise above it. Taking one out of the middle of a group splits the group, so the ends never stay joined.
- **Next time:** the weight rules as numbers for this exercise, a row each: a green up arrow, "Hit all 3 sets of 5", 65 kg; an amber down arrow, "Miss reps 3 sessions in a row", 57.5 kg. Or that automatic changes are off.
- **Swap exercise** and **Remove** side by side at the foot. Swap keeps the sets, reps, weight and rest and changes the lift; Remove, in red, asks first.

Arriving on a workout day opens its first exercise on the right. With nothing open, the right panel says what to click. The program's own settings (Pictures, Starting data, Weight rules and Training blocks) live in the settings window behind the cog in the left panel's header (`program-dashboard.md`).

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

A pause (Pause program in the left header's three dots) takes its dates off the calendar: no missed days, no reminders, no weight drops. Resume puts the week back from today.

## Skipping a day

A planned date can be skipped on purpose. Tyler, 21 Oct 2026, asked what a skipped day counts as: "Neither done nor missed".

- **Where:** "Skip this day" on a planned date in the Calendar's right panel, and "Skip today" in the day's three dots on today's workout. A date in the past can be skipped too, which turns Missed into Skipped. A date with a workout on it, finished or started, can't be skipped.
- **What it does:** the date reads Skipped, with a grey dot and the word beside it, on the calendar, its key and This week. It gets no reminder and no missed-workout nudge, and counts as no miss for the weight rules or the coach's notice. It comes off that week's goal, so a goal of 3 with Friday skipped is 2, and the streak carries on (`weeklyStreak` in `src/lib/fitness/progress.ts`). A week with every workout skipped counts like a paused one.
- **Taking it back:** "Don't skip" on the date, or "Don't skip today", puts it back to planned, or missed if it's in the past. Starting a workout on a skipped date takes the skip back too, and so does moving it.
- **Laying the week out again** never throws a skipped date away (`rescheduleFromToday`).
- **The calendar feed** titles it "Skipped: Push, My program".
- Stored as `fitness_scheduled_workouts.skipped_at` (`drizzle/0101_fitness_twelve_features.sql`).

## Code

`src/components/fitness/program/week-views.tsx` (left panel, Day view, right panel), `day-exercise-panel.tsx`, `calendar-views.tsx`, `program-calendar.tsx`, `calendar-day-card.tsx`, `start-workout.ts`, `this-week.ts`; server `src/server/fitness/week.ts` and `src/server/fitness/calendar.ts`; tables `fitness_week_days` (one row per workout weekday) and `fitness_day_exercises`.
