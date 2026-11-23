# Progress and records

Progress is a view inside each program's dashboard
(`/programs/<id>?view=progress`), the Progress tab in the middle panel. It
shows how someone's training is going, for the lifts of that program's routine
type only: a Strength training program lists strength lifts and nothing else.
Everything in it is read from finished workouts: an unfinished workout counts
for nothing until Finish is pressed.

## The middle panel

Laid out as Tyler drew it on 18 Oct 2026. The day's menu and Start workout sit
in the row with the tabs, as on every view. Under them, four cards:

- **Four figures in one strip.** This week's finished workouts out of the
  weekly goal ("1 of 3"), how many weeks in a row the goal was hit, how many
  lifts have been logged, and the latest bodyweight with its seven-day average
  ("None yet" until there is one). On a phone the four sit two by two.
- **A chart of one lift.** Its heading names the lift and what the line shows.
  One-rep max and Heaviest switch the line between the lift's best estimated
  one-rep max and the heaviest weight actually lifted, for each day it was
  trained. The one-rep max is the heaviest weight the person could likely
  lift once, worked out from a set with the Epley formula: weight x (1 + reps
  / 30). 70 kg for 5 reps works out at about 82 kg. With nothing picked, the
  chart shows the lift trained most recently. A lift logged only once shows a
  dashed box: "Log this lift twice to see a line."
- **Records.** One row per lift: last trained, sessions, heaviest and best
  one-rep max, in small capital headings that sort when pressed. Columns step
  back as the panel narrows. Clicking a lift puts it on the chart, outlines
  its row, opens it on the right, and sets `?open=<lift>` in the address. A
  record notice in the bell opens the same address. Tyler's drawing headed the
  last column "Best 1RM"; it says "Best one-rep max" because the app never
  uses gym shorthand on screen.
- **Records timeline** (21 Oct 2026). Every record ever broken in this
  program's routine type, newest first: "Oct 18, Bench press, 82 kg once
  (was 80 kg)". The kinds are the record notices' kinds: heaviest, best
  one-rep max ("once") and most reps. The first time a lift is logged sets
  the mark and breaks nothing. 20 rows, then Show more. Clicking a row puts
  the lift on the chart and opens it on the right. Nothing is stored: the
  person's sets are walked in the order they were logged, workout by workout
  (`loadRecordTimeline` in `src/server/fitness/progress.ts`).
- **Sets per muscle.** Working sets this week, last week and in a typical week
  over the last eight, each muscle with a bar for this week. A set counts
  once, for its lift's main muscle, so a bench press set is a chest set. It is
  a table rather than a chart because there are fourteen muscles and no set
  of colours tells fourteen apart.

There is no search box: Tyler's drawing has none, and a person tracks a
handful of lifts.

## The missing muscle warning

Above the cards, only when it applies. Tyler, 21 Oct 2026: "When the rest
of the week won't cover it".

- **When:** a body part that usually gets 4 or more working sets a week has
  none so far this week, and none in this week's planned workouts still to
  come. "Usually" is the average of the earlier of the last eight weeks.
- **What it says:** "No leg sets this week, and none planned." Several body
  parts share one line: "No back or chest sets this week, and none planned."
- **Body parts** are the Day view's, from each lift's main muscle, so "leg"
  means the same everywhere.
- **Never** during a pause, in a light week, or with under two weeks of
  workouts behind it.
- Nothing is stored (`missingBodyParts` in `src/lib/fitness/missing-muscles.ts`).

## The right panel

- **The header** holds the lift's name, "1 session · last trained Sun, Oct 18"
  after it, and an × that closes it. Arriving on Progress with nothing open
  opens the first lift in Records. With none open, the header says Lift, then
  an icon and one line saying what to click, and Bodyweight stays under it.
- **Records:** heaviest lifted, best one-rep max, most reps and at what
  weight, and last trained, as four figures two by two, with a line under
  them saying what the one-rep max means.
- **Bodyweight:** the dots and the seven-day line, the target line and the
  pace to it, and the last ten weigh-ins. A weigh-in is added from New
  weigh-in in the middle header. See `weigh-ins.md` and
  `measurements-and-target.md`.
- **Measurements:** the photo days' tape measurements as a line, one at a
  time (`measurements-and-target.md`).

## Comparing lifts

Compare puts a tick box on every lift in Records. Ticking two to four draws
them on the chart together, one line each, in whichever of One-rep max or
Heaviest is chosen. Four is the limit because each line needs a colour of its
own and a legend name beside it. Stop comparing takes the tick boxes away and
goes back to one lift.

## What counts

- Only working sets that were ticked done. Warm-up sets never count.
- A bodyweight lift counts as bodyweight plus what was added: a pull-up at
  80 kg bodyweight with 10 kg on the belt is 90 kg.
- Workouts imported from Strong or Hevy before import was taken out (18 Oct 2026) count the same as logged ones.

## A coach looking

A coach opens a client's program from the client's Programs dashboard; the
program's own dashboard then shows the client's numbers. New weigh-in is
hidden, because a coach reads the line but doesn't weigh in for the client.
The server refuses anyone who isn't the person or a coach they accepted.

## Where it lives

- `src/components/fitness/progress/progress-views.tsx` (the two panels),
  `lift-chart.tsx`, `records-list.tsx`, `weekly-sets.tsx`,
  `bodyweight-card.tsx`.
- `src/server/fitness/progress.ts` reads the numbers and tags each lift with
  its routine type, which the view filters on; `bestNumbers` in
  `src/server/fitness/workouts.ts` is the one place a set's best is worked
  out, shared with the record notices.
- A Calisthenics program's Progress counts reps, not weight: see
  `calisthenics.md`.
- Strength levels (part 18 of the task) are not built yet. They wait on which
  published table to compare against, which is Tyler's call.
