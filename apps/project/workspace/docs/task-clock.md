# The task clock

A task's panel has a clock that counts how long the task takes. The person
doing the task starts it and pauses it. Nothing runs unless they press Start
task. Tyler asked for it on 20 Oct 2026
(`workspace/tasks/Task panel/01-task-panel-footer-and-clock.md`).

## Tyler's choices, 20 Oct 2026

- **It counts up from 0:00**, like a stopwatch. It never counts down.
- **Start moves To do to Doing. Completed moves the task to Done**
  and stops the clock. Done goes through the usual checks: "Needed before
  Done" fields and review.
- **Only the person the task is assigned to, and the site admin, start or
  pause the clock.** Everyone on the project sees the total.
- **Anyone on the project can press Completed**, the same as the status
  dropdown.
- **Start on a task with nobody assigned makes it theirs**, with a
  history line saying they took it.
- **A Done task's footer shows "Done · 2h 15m" and Start again**, which moves
  it back to Doing and carries on from 2h 15m.
- **The footer is on the side panel only**, on the project page and My
  dashboard. The Team dashboard's task window keeps its buttons.
- **A clock still running at midnight** in the person's own time zone pauses,
  and they find a bell notice the next morning.
- **Times in Yesterday show to everyone on the team**, on the Team dashboard
  too.

## The task panel's footer

- **Pinned under the panel**, with a line above it, while the rest scrolls.
  Left to right: the status dropdown, the clock, then Start or Pause,
  then Completed. In a narrow panel the two buttons drop to a row of
  their own together, at the right.
- **The clock reads "0:42" under an hour and "1:24:05" over one** while it
  runs, and the total, such as "2h 15m", while paused. A task whose clock
  never ran shows only the timer icon.
- **Pressing the clock opens two boxes.** Time spent, which the person
  assigned and the site admin can change, for a clock left running by
  mistake. Guess, which anyone on the project can set. Each takes "45m",
  "1h 30m", "1.5h" or "1:30", saves when left or on Enter, and an empty box
  clears it. Something else is refused, marked and kept as typed.
- **A guess shows beside the time**: "20m over" in red, "10m left" in grey,
  or "On the guess".
- **Someone who can't run the clock** sees the status, the time and Task
  completed, with no Start or Pause. No button sits there greyed out.
- **Completed with steps left asks first**: "Mark it completed anyway?
  2 of 5 steps aren't done."
- **A refusal**, such as an empty "Needed before Done" field, says why, and
  the clock keeps its time.
- **An archived project's task** shows the status and the time, and nothing
  can be pressed.

## How the clock counts

- **One stretch at a time.** Each Start to Pause is a row of its own,
  counted for the person assigned, even when the site admin pressed it. The
  task's time is the sum of its rows, so a reload, another computer or a
  hand-over never loses any.
- **One clock per person.** Starting a clock pauses any other clock that
  person has running, and a notice names the task that paused.
- **Starting accepts.** Start on a task handed to you and not yet
  accepted accepts it.
- **The clock runs only while the task is Doing.** Moving it to Stuck, To do
  or Done pauses it, from the panel, the List, the Board or a bulk change
  alike.
- **It also pauses** when the task is handed to someone else or handed back,
  goes in the bin, when its person checks out, when its person comes off
  the project or the team, and when the project is archived, since nothing in
  an archived project can be pressed.
- **At midnight** in the person's own zone (the team's when they set none) a
  clock still running pauses at that midnight, so nothing after it counts.
  The bell then holds "Clock paused at midnight: Fix the login page", with
  the project and "3h 10m in all" under it. It has no switch, the same as
  Remind me, because the person started the clock themselves.
- **A time set by hand** is saved as the difference from the old total, and
  History keeps both: "Sam changed the time from 3h to 1h 10m".

## Where the time shows

- **The project's left panel, its milestones and the Projects table**, from
  20 Oct 2026: "14h 20m clocked", each milestone's clocked time after its
  dates, and a Time column on the Projects table, off until picked (see
  [Projects and tasks](projects-and-tasks.md#milestones)). None of them is
  set against the guesses (Tyler, 20 Oct 2026: "remove the guesses time.
  dont need it").
- **History**, in the task's cog: "Sam started the clock", "Sam paused the
  clock after 45m", "The clock paused itself at midnight after 3h", "Sam took
  it" and the change above (see [History](history.md)). The project's
  Activity tab leaves the clock's lines out, so they don't bury everything
  else. "Took" shows there.
- **The List**: a task whose clock is running has "Doing" after its title in
  a chip with a rainbow running round its edge, the same rainbow as the "N
  selected" button (`rainbow-edge.tsx`). It holds still for anyone whose
  device asks for less motion.
- **My dashboard**: a task whose clock is running shows the ticking time and
  a Pause button at the end of its row in My tasks.
- **The List**: the Columns menu has Time, off until picked, remembered in
  this browser for every project. It sorts.
- **Yesterday**: each finished task with a minute or more on the clock reads
  "Fix the login page, 1h 20m" (see
  [The morning check-in](morning-check-in.md)).
- **Workload** on the Team dashboard: each person's clocked time this week,
  Monday to now in their own zone, "6h 20m this week" beside their name,
  counting only projects the viewer can see (see
  [Needs attention and workload](needs-attention.md)).

## Where it lives

- **Saved** in `project_task_clock_runs` and `project_tasks.guess_minutes`
  (`drizzle/0125_project_task_clock.sql`, applied locally only on 20 Oct
  2026). A "run" row is one stretch; a "fix" row is a total set by hand.
- **Rules:** `src/server/project/task-clock.ts` (Start, Pause, set total,
  midnight) and `src/server/project/task-clock-runs.ts` (adding up, pausing,
  the week's hours). Words and sums for both sides: `src/lib/project/clock.ts`.
- **Screen:** `src/components/project/task-clock.tsx`, placed by
  `task-side-panel.tsx`.
- **Tests:** `src/server/project/task-clock.test.ts`,
  `src/lib/project/clock.test.ts`, and the List and My tasks rows in
  `src/components/project/project-screens.test.tsx`.
