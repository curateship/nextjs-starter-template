-- Planning tasks ahead (Next features task 05): repeating tasks, snoozing,
-- waiting on another task, tasks that belong to one person alone, and a bin.

-- A repeating task. The rule sits on the newest copy only: each new copy
-- takes it over, so deleting the newest stops the repeat. Every copy carries
-- the first task's id as its series, which is what a day's copy is claimed by.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "repeat_every" varchar(8),
  ADD COLUMN IF NOT EXISTS "repeat_week_days" smallint[],
  ADD COLUMN IF NOT EXISTS "repeat_month_day" smallint,
  ADD COLUMN IF NOT EXISTS "repeat_series_id" varchar(36),
  -- Out of the check-in and My tasks until the person's own morning of this day.
  ADD COLUMN IF NOT EXISTS "snoozed_until" date,
  -- The task that has to happen first. Deleting it for good clears the link.
  ADD COLUMN IF NOT EXISTS "waiting_on_task_id" varchar(36)
    REFERENCES "project_tasks" ("id") ON DELETE SET NULL,
  -- In the bin: hidden everywhere, brought back whole, gone for good after 30 days.
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE SET NULL;

ALTER TABLE "project_tasks" DROP CONSTRAINT IF EXISTS "project_tasks_repeat_every";
ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_repeat_every" CHECK (
    "repeat_every" IS NULL OR "repeat_every" IN ('workday', 'week', 'month')
  );

CREATE INDEX IF NOT EXISTS "ix_project_tasks_repeating"
  ON "project_tasks" ("repeat_every") WHERE "repeat_every" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_project_tasks_deleted"
  ON "project_tasks" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_project_tasks_waiting_on"
  ON "project_tasks" ("waiting_on_task_id") WHERE "waiting_on_task_id" IS NOT NULL;

-- One copy of a repeating task per day, claimed before it is made.
CREATE TABLE IF NOT EXISTS "project_repeat_runs" (
  "series_id" varchar(36) NOT NULL,
  "day" date NOT NULL,
  "made_at" timestamptz NOT NULL,
  PRIMARY KEY ("series_id", "day")
);

-- "Just me": each person's own tasks live in a project of their own that
-- nobody else can open, not even the owner. It never shows on the Projects
-- page.
ALTER TABLE "project_projects"
  ADD COLUMN IF NOT EXISTS "personal_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_projects_personal"
  ON "project_projects" ("team_id", "personal_user_id") WHERE "personal_user_id" IS NOT NULL;

-- Deleting and bringing back are moments in a task's history too.
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored'
    )
  );
