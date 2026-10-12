# Repeating tasks

Routine work comes back on its own, so it doesn't clutter the check-in or get
forgotten.

## Setting it

- **In the task's Plan card**, Repeat offers Every work day, Every week (on
  the days ticked), Every 2 weeks (on the days ticked), Every month (on a day
  of the month), Every 3 months (from a first date) and Last work day of the
  month. Doesn't repeat turns it off.
- **Every work day** means the team's work days, from Team settings.
- **A month day past the month's end** falls on its last day: "the 31st" is
  28 February.
- **Every 2 weeks** counts the week it is first set in, on the team's
  calendar, as the first, then every other week, Monday to Sunday. The card
  says "The week of Oct 12 counts as the first, then every other week."
  Ticking another day keeps the same weeks.
- **Every 3 months** comes back on the first date's day, every third month
  from it. Tyler chose a first date on 12 Oct 2026, so the card can say
  "Comes back on the 15th of Jan, Apr, Jul and Oct." A day past a month's end
  falls on its last day, the same as Every month, and no copy comes before
  the first date.
- **Last work day of the month** is the team's last work day in each month,
  so a month ending on a Sunday comes back on the Friday. Holidays don't
  move it, the same as Every work day.
- **Saved values keep their names.** The three newer choices were added on
  12 Oct 2026 beside the old ones (`REPEAT_EVERY` in
  `src/lib/project/rules.ts`).

## How copies appear

- **At midnight in the team's time zone**, on each day the rule falls on, the
  job makes a fresh copy: the title, notes, labels and section, the type and
  its field values (files stay behind), the priority, the steps unticked, the same person
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
- **No catch-up copies.** The job only looks at today. A server that was down
  on a repeat day makes nothing for it later; the next copy comes on the next
  repeat day, so downtime never makes two.
- **Archived projects and tasks in the bin** make no copies.

## Where it lives

- **Columns and claims:** `drizzle/0101_project_planning_ahead.sql`
  (`repeat_every`, `repeat_week_days`, `repeat_month_day`, `repeat_series_id`
  and `project_repeat_runs`), and `drizzle/0111_project_planning_tasks.sql`
  (the three newer values and `repeat_from`, the week or first date the
  newer rules count from, carried by every copy).
- **Setting the rule:** `setRepeat` in `src/server/project/planning.ts`.
- **The job:** `makeRepeatCopies` in `src/server/project/planning-jobs.ts`,
  listed as `project-planning` in `src/app/server-options.ts`.
- **Screen:** the Repeat field in `src/components/project/task-plan-card.tsx`.
