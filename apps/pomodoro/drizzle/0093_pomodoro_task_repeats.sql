-- Repeat rules for tasks.
--
-- A rule is its own row, not a flag on a task, because a task belongs to one
-- calendar day and a rule outlives every day it makes. The rule holds the
-- template (title, priority, estimate) so the morning copy can be written
-- without reading yesterday's row.
--
-- `weekdays` is a seven-bit set: bit 0 is Sunday through bit 6 is Saturday.
-- "Every day" is all seven bits (127) rather than a separate kind, so there is
-- one field and no way for two fields to disagree.
CREATE TABLE IF NOT EXISTS "pomodoro_task_repeats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "priority" varchar(10) NOT NULL DEFAULT 'normal',
  "estimated_pomodoros" integer,
  "weekdays" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_task_repeats_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high')),
  CONSTRAINT "pomodoro_task_repeats_estimate_check"
    CHECK ("estimated_pomodoros" IS NULL OR "estimated_pomodoros" BETWEEN 1 AND 20),
  -- At least one day picked; a rule that repeats on no day would be a rule
  -- that does nothing, and "none" is expressed by deleting the row.
  CONSTRAINT "pomodoro_task_repeats_weekdays_check"
    CHECK ("weekdays" BETWEEN 1 AND 127)
);
CREATE INDEX IF NOT EXISTS "pomodoro_task_repeats_user_idx"
  ON "pomodoro_task_repeats" ("user_id");

-- ON DELETE SET NULL is the "ending the repeat stops new copies without
-- deleting past ones" rule: dropping the rule leaves every task it already
-- made exactly where it is.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "repeat_id" uuid
  REFERENCES "pomodoro_task_repeats"("id") ON DELETE SET NULL;

-- One task per rule per day, enforced by the database rather than by the
-- rollover's own check, because two browser tabs can load the day at the same
-- moment and both find nothing there.
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_repeat_day_unique"
  ON "tasks" ("repeat_id", "planned_date")
  WHERE "repeat_id" IS NOT NULL;
