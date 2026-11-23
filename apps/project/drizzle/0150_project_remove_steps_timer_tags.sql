-- Steps, the task clock and tags leave Project (Tyler, 6 Nov 2026: "remove
-- the steps, timer and tags feature"). Project holds only test data, so each
-- removed feature takes its tables, columns and saved rows with it.

-- The task clock: its stretches, a task's guess, its history lines ("took" was
-- written only by Start on a task nobody had), and the "Clock paused at
-- midnight" bell notices. The trigger on the clock table goes with the table.
DROP TABLE IF EXISTS "project_task_clock_runs";
ALTER TABLE "project_tasks" DROP COLUMN IF EXISTS "guess_minutes";

DELETE FROM "project_task_events"
  WHERE "kind" IN ('took', 'clock_started', 'clock_paused', 'clock_fixed');
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back', 'due_moved',
      'time_asked', 'time_agreed', 'time_kept'
    )
  );

DELETE FROM "notifications"
  WHERE "id" IN (SELECT "notice_id" FROM "project_notice_links" WHERE "kind" = 'clock_paused')
    OR ("type" = 'app_activity' AND "message" LIKE 'Clock paused at midnight: %');
