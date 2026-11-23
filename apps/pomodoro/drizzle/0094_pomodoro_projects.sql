-- Projects: the level people bill and think at, above the single task.
--
-- Archiving is a timestamp, not a delete, because History has to keep showing
-- the hours a finished project earned after it leaves the picker.
CREATE TABLE IF NOT EXISTS "pomodoro_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Two live projects may not share a name, or the picker shows two identical
-- rows. An archived one is excluded, so the name can be used again later.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_projects_live_name_unique"
  ON "pomodoro_projects" ("user_id", lower("name"))
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "pomodoro_projects_user_idx"
  ON "pomodoro_projects" ("user_id");

-- A task holds at most one project. ON DELETE SET NULL keeps the task and its
-- finished sessions when a project row is ever removed outright.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "project_id" uuid
  REFERENCES "pomodoro_projects"("id") ON DELETE SET NULL;

-- The repeat rule carries the project too, so tomorrow's copy lands in the
-- same project without the rollover reading yesterday's row.
ALTER TABLE "pomodoro_task_repeats"
  ADD COLUMN IF NOT EXISTS "project_id" uuid
  REFERENCES "pomodoro_projects"("id") ON DELETE SET NULL;

-- History groups completed focus by project through the task, so the join
-- column wants an index once a person has a few hundred days of rows.
CREATE INDEX IF NOT EXISTS "tasks_project_idx" ON "tasks" ("project_id");
