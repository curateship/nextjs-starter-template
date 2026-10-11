-- Making and changing tasks (Next features task 04).
--
-- Three more moments in a task's history: a step that became its own task
-- (on the task it came from, and on the new one), and a move to another
-- project. The existing kinds keep their names.
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN ('handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved')
  );

-- The other task a moment points at: the new task a step became, or the task
-- a step came from. Deleting that task leaves the line without its link.
ALTER TABLE "project_task_events"
  ADD COLUMN IF NOT EXISTS "related_task_id" varchar(36)
    REFERENCES "project_tasks" ("id") ON DELETE SET NULL;

-- A step can name someone on the project and a due date, for a small job two
-- people share inside one task. It shows only inside the task (Tyler's choice).
ALTER TABLE "project_task_steps"
  ADD COLUMN IF NOT EXISTS "assignee_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "due_date" date;
