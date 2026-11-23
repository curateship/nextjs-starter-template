-- Task history (task file 03): handing a task over, accepting it and handing
-- it back, saved as they happen so the task's whole life reads on one line
-- beside the days it was picked. A task only holds who has it now, so these
-- moments are lost unless they are written down when they happen.

CREATE TABLE IF NOT EXISTS "project_task_events" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  -- Who did it: who handed it over, who accepted it, who handed it back.
  "actor_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  -- Who it went to, for a hand-over or a hand-back.
  "target_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "reason" text,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "project_task_events_kind" CHECK ("kind" IN ('handed_over', 'accepted', 'handed_back'))
);

CREATE INDEX IF NOT EXISTS "ix_project_task_events_task"
  ON "project_task_events" ("task_id", "created_at");
