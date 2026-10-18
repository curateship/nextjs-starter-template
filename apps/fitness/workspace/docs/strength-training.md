# Programs and routine types

Fitness is built around programs. Tyler, 18 Oct 2026: "There is a program dashboard. I create a program via modal, choose a routine, input my starting data then create. Only then I get to the 3 panel dashboard." A program is like a project: the thing a person makes and names, such as "Summer strength". Its routine is the type, such as Strength training, and the type decides every field and screen under it. Strength training is the only routine type that works today. Calisthenics, Running and Mobility show as "Coming soon" and can't be picked.

## The rules Tyler set

- **Program first.** The Programs dashboard (`/programs`) lists them. New program is a window: name, routine type, starting data, Create. Only then does the program's three-panel dashboard (`/programs/<id>`) open.
- **A program is one fixed week.** Each weekday, Monday to Sunday, is either a workout or Rest. Tyler picked this over the earlier version, where training days rotated across whatever weekdays were ticked, which he called "confusing as hell". The calendar simply repeats the week.
- **The workout is logged inside the program's dashboard.** Start turns the middle panel into the live workout; the right panel shows the current exercise.
- **Exercises have their own dashboard** (`/exercises`), filtered by routine type. "The program only list excercises that are related to it": a program only ever offers lifts of its own routine type.
- **Every setting is app-wide.** "All these settings live in settings page in the app settings reserved for the app": units and plates, warm-ups, weekly goal, sex, reminders and the calendar feed are tabs under Settings, App settings, one answer for the whole app, changed by the site admin. A person keeps only their own clock and their own calendar feed address.

## The tables

- `fitness_programs`: name, owner, routine type, active, archived. Nothing about sets or kilograms, so a second routine type adds tables beside Strength training's instead of changing this one.
- `fitness_strength_settings`: Strength training's own settings for one program: the weight rules, training blocks and the share code.
- `fitness_week_days`: one row per weekday that holds a workout (`weekday`, 0 is Sunday). A weekday with no row is a rest day.
- `fitness_day_exercises`: each workout day's lifts in order, with sets, reps, working weight and rest.
- `fitness_scheduled_workouts`: the calendar, the week laid onto dates four weeks ahead. "Missed" and "paused" are never stored; a planned date in the past is missed, one inside a pause is paused.
- `fitness_workouts` and `fitness_workout_sets`: what was actually logged, one row per set.
- `fitness_exercises`: built-in lifts (with a slug) and a person's own (with an owner), each tagged with its `routine_type`.
- `fitness_app_settings`: the app-wide settings, one row per group (`units`, `workouts`, `reminders`).
- Migrations: `drizzle/0096_fitness_strength_training.sql` made the first tables; `drizzle/0097_fitness_programs_and_the_week.sql` renamed routines to programs, turned the old rotating days into weekdays (each old day took the training weekday at its place, the rest the first free weekday), tagged exercises by routine type, and moved the settings app-wide, keeping the first person's choices.

## Rules that hold everywhere

- **Every weight is stored in kilograms and never rounded.** With pounds picked in Settings, every screen shows pounds, converted on the way in and out.
- **A new install starts on kilograms, 2.5 kg jumps and a 20 kg bar.** Tyler hasn't confirmed this default.
- **The one-rep max is an estimate**: the heaviest weight someone could likely lift once, worked out as weight x (1 + reps / 30). 80 kg for 5 reps is about 93 kg.
- **A bodyweight lift stores only what was added.** A pull-up with a 10 kg plate on the belt saves 10 kg and the person's bodyweight beside it; records and charts add the two.
- **Warm-up sets never count** toward records, charts or the weight rules.
- **Nobody reaches another person's records by guessing an id.** Every server call checks the person first (`src/server/fitness/access.ts`), and something a person can't see answers exactly like something that doesn't exist.
- **A coach reads but never logs.** A linked coach can build and change a client's programs and read their workouts; only the person who trained can log, change or delete a workout.

## Where the code lives

- Server work: `src/server/fitness/`. Calls the browser makes: `src/lib/api/fitness/`. Shared maths with tests: `src/lib/fitness/`.
- The built-in lifts are written in `src/lib/fitness/exercise-catalog.ts` and copied into `fitness_exercises` the first time the library is read, matched by slug.
- The left menu's Training section (Programs, Exercises) is added once per menu by `src/server/fitness/navigation.ts`; a link an admin removes stays removed.

## A brand-new database

The Personal IDE gives a new app a `.scaffold-database.json` (not in git) that the first `npm run db:setup` imports and then deletes. It refuses unless the snapshot names exactly the tables the migrations made, so a migration that adds a table before the first run must also add the table to the snapshot, empty.

## Open questions (Tyler's call)

- Kilograms or pounds as the default, and 1.25 kg or 2.5 kg as the smallest jump.
- Which published table strength levels compare against. Strength levels are not built until this is chosen.
- Whether a coach may see a client's photos. Today the client switches it on for each coach.
- Whether a shared program's public page shows the owner's weights. Today it shows sets, reps and rest only.
- Opening the app from cold with no signal needs a service worker in the shell; see `logging-without-signal.md`.
