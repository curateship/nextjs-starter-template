-- Tasks and planning (tasks-and-planning task 01): steps inside a task, an
-- hours target per project, and tags on tasks. Planning a future day needs no
-- change here: tasks.planned_date and its (user_id, planned_date) index were
-- always there and only ever read with today.

-- Part 2. A short checklist under one task. The task's own completion stays
-- separate, so ticking the last step finishes nothing by itself. Deleting the
-- task deletes its steps. The ten-step cap is checked by the server inside
-- the transaction that adds a step, under a lock on the task row.
CREATE TABLE IF NOT EXISTS "pomodoro_task_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(120) NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_task_steps_sort_order_check" CHECK ("sort_order" >= 0)
);
CREATE INDEX IF NOT EXISTS "pomodoro_task_steps_task_idx"
  ON "pomodoro_task_steps" ("task_id", "sort_order");

-- Part 3. A project may aim at a number of hours each week or each month. A
-- target with no period means nothing, so the two are set together or not at
-- all, and the database refuses one without the other. The IS NOT NULL tests
-- are needed: a check that comes out NULL counts as passed, so without them
-- an hours figure with no period would get through. A project with neither
-- behaves exactly as it did before.
ALTER TABLE "pomodoro_projects"
  ADD COLUMN IF NOT EXISTS "target_hours" integer,
  ADD COLUMN IF NOT EXISTS "target_period" varchar(10);
ALTER TABLE "pomodoro_projects"
  DROP CONSTRAINT IF EXISTS "pomodoro_projects_target_check";
ALTER TABLE "pomodoro_projects"
  ADD CONSTRAINT "pomodoro_projects_target_check" CHECK (
    ("target_hours" IS NULL AND "target_period" IS NULL)
    OR (
      "target_hours" IS NOT NULL
      AND "target_period" IS NOT NULL
      AND "target_hours" BETWEEN 1 AND 744
      AND "target_period" IN ('week', 'month')
    )
  );

-- Part 4. Short labels that cut across projects. A tag belongs to one account
-- and its name is unique within that account, ignoring case. A tag nobody has
-- used lately leaves the picker but is never deleted, because History still
-- filters by it.
CREATE TABLE IF NOT EXISTS "pomodoro_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(24) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_tags_user_name_unique"
  ON "pomodoro_tags" ("user_id", lower("name"));

-- Which tags a task carries. The cap of three per task is checked by the
-- server when the set is written.
CREATE TABLE IF NOT EXISTS "pomodoro_task_tags" (
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "pomodoro_tags"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("task_id", "tag_id")
);
-- History asks "which sessions had a task carrying this tag", which starts
-- from the tag.
CREATE INDEX IF NOT EXISTS "pomodoro_task_tags_tag_idx"
  ON "pomodoro_task_tags" ("tag_id");
