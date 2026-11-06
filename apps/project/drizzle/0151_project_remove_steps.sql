-- Steps leave Project (Tyler, 6 Nov 2026: "remove the steps, timer and tags
-- feature"). Project holds only test data, so steps take their tables,
-- columns and saved rows with them: a task's steps, the team's saved step
-- lists, a task template's starting steps and their fields, the history lines
-- for a step made into its own task, and the "gave you a step" bell notices.
-- The live-update trigger on the steps table goes with the table.
DROP TABLE IF EXISTS "project_task_steps";
DROP TABLE IF EXISTS "project_step_lists";
ALTER TABLE "project_task_types" DROP COLUMN IF EXISTS "steps";
ALTER TABLE "project_task_types" DROP COLUMN IF EXISTS "step_fields";

-- "became_task" and "from_step" were the only lines that pointed at another
-- task, so the link column goes too.
DELETE FROM "project_task_events" WHERE "kind" IN ('became_task', 'from_step');
ALTER TABLE "project_task_events" DROP COLUMN IF EXISTS "related_task_id";
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back', 'due_moved',
      'time_asked', 'time_agreed', 'time_kept'
    )
  );

DELETE FROM "notifications"
  WHERE "id" IN (SELECT "notice_id" FROM "project_notice_links" WHERE "kind" = 'task_step');
DELETE FROM "project_notices_off" WHERE "kind" = 'task_step';
