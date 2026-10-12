# Repeating tasks

Routine work comes back on its own, so it doesn't clutter the check-in or get
forgotten.

## Setting it

- **In the task's Plan card**, Repeat offers Every work day, Every week (on
  the days ticked), or Every month (on a day of the month). Doesn't repeat
  turns it off.
- **Every work day** means the team's work days, from Team settings.
- **A month day past the month's end** falls on its last day: "the 31st" is
  28 February.

## How copies appear

- **At midnight in the team's time zone**, on each day the rule falls on, the
  job makes a fresh copy: the title, notes, labels and section, the type and
  its field values (files stay behind), the steps unticked, the same person
  (already accepted, so no new Waiting or notice), and To do. A copy skips
  the "Needed when made" check. A copy of a task with a due date is due on the day it was made
  for.
- **Only once the last copy is Done.** Tyler's rule, 10 Oct 2026: when the
  newest copy isn't Done, no new one appears. The next comes on the first
  repeat day after it is Done, so copies never pile up.
- **Never on the day the task was made.** A task set to repeat every work day
  gets its first copy the next work day.
- **The rule moves to the newest copy.** The older one keeps everything else
  and becomes an ordinary task. So the repeat is changed or turned off on the
  newest copy, and deleting the newest copy stops it.
- **Two passes make one copy.** Each copy is claimed in `project_repeat_runs`
  by its series (the first task's id, carried by every copy) and its day, in
  the same transaction that makes it.
- **Archived projects and tasks in the bin** make no copies.

## Where it lives

- **Columns and claims:** `drizzle/0101_project_planning_ahead.sql`
  (`repeat_every`, `repeat_week_days`, `repeat_month_day`, `repeat_series_id`
  and `project_repeat_runs`).
- **Setting the rule:** `setRepeat` in `src/server/project/planning.ts`.
- **The job:** `makeRepeatCopies` in `src/server/project/planning-jobs.ts`,
  listed as `project-planning` in `src/app/server-options.ts`.
- **Screen:** the Repeat field in `src/components/project/task-plan-card.tsx`.
