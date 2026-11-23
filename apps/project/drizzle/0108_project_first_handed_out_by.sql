-- Who first handed a task out (Tyler's choice, 12 Oct 2026). A task type's
-- field limited to "whoever handed it out", and changing a task's type, stay
-- with this person however the task is handed around later. Null means
-- nobody has handed it out yet, and then it is whoever made the task.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "first_handed_out_by_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE SET NULL;

-- Tasks handed out before this column: the earliest hand-over in their
-- history, which has been kept since 10 Oct 2026.
UPDATE "project_tasks" t
SET "first_handed_out_by_user_id" = e."actor_user_id"
FROM (
  SELECT DISTINCT ON ("task_id") "task_id", "actor_user_id"
  FROM "project_task_events"
  WHERE "kind" = 'handed_over' AND "actor_user_id" IS NOT NULL
  ORDER BY "task_id", "created_at" ASC
) e
WHERE e."task_id" = t."id" AND t."first_handed_out_by_user_id" IS NULL;

-- Handed out with no history line: whoever the task says handed it out,
-- when that was someone other than the person doing it.
UPDATE "project_tasks"
SET "first_handed_out_by_user_id" = "assigned_by_user_id"
WHERE "first_handed_out_by_user_id" IS NULL
  AND "assigned_by_user_id" IS NOT NULL
  AND "assigned_by_user_id" IS DISTINCT FROM "assignee_user_id";
