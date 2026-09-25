# Tasks

Today's plan, at `/tasks` and in the Tasks card on `/timer`. A task has a
title, a Low/Normal/High priority, an optional estimate of 1 to 20 sessions,
and a done count shown as `done/estimate pomos`.

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
today's list — priority, estimate, done count and order intact — and marks
each original as `carried`, linked to its copy (`rollOverTasks` in
`src/server/pomodoro/tasks.ts`, run by the load itself; there is no
scheduled job). The archive section under Today groups past days newest
first, up to 50 rows, with a badge per row: Completed (green), Carried over
(orange) or Abandoned (grey).
