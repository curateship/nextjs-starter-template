# Progress and records

Progress is a view inside each program's dashboard
(`/programs/<id>?view=progress`), the Progress tab in the middle panel. It
shows how someone's training is going, for the lifts of that program's routine
type only: a Strength training program lists strength lifts and nothing else.
Everything in it is read from finished workouts: an unfinished workout counts
for nothing until Finish is pressed.

## The middle panel

- **The toolbar** searches the records list and holds Compare.
- **Four tiles.** This week's finished workouts out of the weekly goal, how
  many weeks in a row the goal was hit, how many lifts have been logged, and
  the latest bodyweight with its seven-day average.
- **A chart of one lift.** It draws the lift's best estimated one-rep max for
  each day it was trained. The one-rep max is the heaviest weight the person
  could likely lift once, worked out from a set with the Epley formula:
  weight x (1 + reps / 30). 70 kg for 5 reps works out at about 82 kg. The
  Heaviest switch adds a dashed second line for the heaviest weight actually
  lifted that day. With nothing picked, the chart shows the lift trained most
  recently.
- **Records.** One row per lift with its best one-rep max. As the panel
  widens, more columns appear: last trained, then heaviest, then how many
  days it was trained. The list sits straight on the panel, the way Project's
  List does, with no card around it. Clicking a lift puts it on the chart and
  opens it on the right, and sets `?pick=<lift>` in the address. A record
  notice in the bell opens the same address.
- **Sets per muscle.** Working sets this week, last week and in a typical week
  over the last eight. A set counts once, for its lift's main muscle, so a
  bench press set is a chest set. It is a table rather than a chart because
  there are fourteen muscles and no set of colours tells fourteen apart.

## The right panel

- **Records** for the picked lift (or the one on the chart): heaviest lifted,
  best one-rep max, most reps and at what weight, last trained, and how many
  sessions, with a line saying what the one-rep max means.
- **Bodyweight.** See `weigh-ins.md`.

## Comparing lifts

Ticking two to four lifts in the records list and pressing Compare draws them
on the chart together, one line each. Four is the limit because each line
needs a colour of its own and a legend name beside it. Clicking any lift, or
Stop comparing, goes back to one lift.

## What counts

- Only working sets that were ticked done. Warm-up sets never count.
- A bodyweight lift counts as bodyweight plus what was added: a pull-up at
  80 kg bodyweight with 10 kg on the belt is 90 kg.
- Imported workouts from Strong or Hevy count the same as logged ones.

## A coach looking

A coach opens a client's program from the client's Programs dashboard; the
program's own dashboard then shows the client's numbers. The weigh-in entry is
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
- Strength levels (part 18 of the task) are not built yet. They wait on which
  published table to compare against, which is Tyler's call.
