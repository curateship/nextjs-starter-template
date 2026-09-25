# Tasks

Today's plan, at `/tasks` and in the Tasks card on `/timer`. A task has a
title, a Low/Normal/High priority, an optional estimate of 1 to 20 sessions,
a done count shown as `done/estimate pomos`, an optional repeat rule, and an
optional project ([Projects](projects.md)).

## How it behaves

- **Create** with the "Add a task, press Enter…" field. **Edit inline** with
  the settings button on a row: title, priority (shadcn Select) and estimate.
- **Reorder by drag** — mouse, touch or keyboard — with dnd-kit, announced to
  screen readers (`src/components/pomodoro/today-task-list.tsx`). The server
  only accepts an order that names today's full active list exactly once
  (`TASK_ORDER_MISMATCH` in `src/server/pomodoro/tasks.ts`); a refused order
  rolls back on screen and reloads the list.
- **Complete and reopen** with the row checkbox. Completing adds one to the
  day's `tasks_completed` stat, reopening takes it back. Completed tasks
  group below the active ones.
- **Remove** marks the row `abandoned`; it keeps its finished sessions.
- **The focus task:** clicking a row's title picks it, only while the timer
  is fully idle. The next focus session carries its id, and completing that
  focus adds one to the task's count (`completeProductivitySession`).

## Where things live

Rows live in the `tasks` table (`src/server/pomodoro/schema.ts`, migration
`0083_pomodoro_tasks.sql`, which also points `focus_sessions.task_id` at it —
a deleted task keeps its sessions through `on delete set null`). Endpoints
are in `src/lib/api/pomodoro/productivity.ts`, all guarded. Tasks belong to
one calendar day (`planned_date`).

## Rollover and archive

Opening the app copies every still-active task from an earlier day onto
today's list — priority, estimate, project, repeat rule, done count and order
intact — and marks each original as `carried`, linked to its copy
(`rollOverTasks` in `src/server/pomodoro/tasks.ts`, run by the load itself;
there is no scheduled job). The archive section under Today groups past days
newest first, up to 50 rows, with a badge per row: Completed (green), Carried
over (orange) or Abandoned (grey).

## Repeating a task

A task can come back every day, Monday to Friday, or on days you tick. The
repeat is set in the task's own editor, next to the project, and a repeating
task shows a small repeat icon after its title whose tooltip says which days.

- **The rule is a row of its own**, `pomodoro_task_repeats` (migration
  `0093_pomodoro_task_repeats.sql`), not a column on the task. A task belongs
  to one calendar day and a rule outlives every day it makes.
- **The picked days are one seven-bit number**, bit 0 Sunday through bit 6
  Saturday, so "every day" is all seven bits rather than a separate kind and
  two fields can never disagree. `src/lib/pomodoro/task-repeats.ts` holds the
  arithmetic and is the only place that reads a weekday.
- **The rollover asks each rule for the day's copy**, after it has carried
  yesterday's unfinished tasks. That order is what stops one task arriving
  twice: a carried copy keeps the rule's id, so the rule finds it and adds
  nothing. A unique index on `(repeat_id, planned_date)` backs that up, for
  the case of two browser tabs loading the day at the same moment.
- **Completing today's copy never touches the rule.** Tomorrow's copy still
  arrives, with a done count of zero.
- **Ending the repeat deletes the rule row**, which stops future copies. The
  days it already made stay exactly where they are, through
  `on delete set null` on `tasks.repeat_id`.
- **Editing a repeating task edits the rule too.** Rename it and tomorrow's
  copy has the new name, because the rule keeps its own copy of the title,
  priority, estimate and project (`updateTaskPlan`).
- **Removing today's copy does not bring it back on reload.** The removed row
  still holds the rule's id for that day, so the unique index refuses a second
  one. The rule resumes tomorrow.
- **Guests cannot repeat a task.** The copy is made on the server each
  morning and a guest has no rollover, so the control is shut with that reason
  rather than hidden.
