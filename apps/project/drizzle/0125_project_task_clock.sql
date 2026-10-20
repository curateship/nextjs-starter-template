-- The task clock (Task panel task 01, Tyler, 20 Oct 2026). Start task starts
-- it, Pause stops it, and a task's time is the sum of its rows, so a reload,
-- another computer or a hand-over never loses any.
--
-- A "run" row is one stretch of the clock: who it counted for, when it
-- started, and when it stopped with its length in seconds. Both stay empty
-- while it runs. A "fix" row is a total set by hand: it starts and stops at
-- the same moment and holds the difference, which may be below zero.
CREATE TABLE IF NOT EXISTS "project_task_clock_runs" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "kind" varchar(8) NOT NULL DEFAULT 'run',
  "started_at" timestamptz NOT NULL,
  "stopped_at" timestamptz,
  "seconds" integer,
  CONSTRAINT "project_task_clock_runs_kind" CHECK ("kind" IN ('run', 'fix'))
);

-- One running clock per task, and one per person (task part 2).
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_task_clock_runs_task_running"
  ON "project_task_clock_runs" ("task_id") WHERE "stopped_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_task_clock_runs_user_running"
  ON "project_task_clock_runs" ("user_id") WHERE "stopped_at" IS NULL;
CREATE INDEX IF NOT EXISTS "ix_project_task_clock_runs_task"
  ON "project_task_clock_runs" ("task_id");
CREATE INDEX IF NOT EXISTS "ix_project_task_clock_runs_user"
  ON "project_task_clock_runs" ("user_id", "started_at");

-- Starting or pausing the clock refreshes the task wherever it is open, the
-- same as a step (`drizzle/0109_project_chat_and_talking.sql`).
DROP TRIGGER IF EXISTS "project_live_clock_runs" ON "project_task_clock_runs";
CREATE TRIGGER "project_live_clock_runs"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_clock_runs"
  FOR EACH ROW EXECUTE FUNCTION "project_live_task_part_changed"();

-- A guess at how long the task takes, in minutes (task part 11). Null is no guess.
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "guess_minutes" integer;

-- The clock's own history lines (task part 5), and "took" for Start task on a
-- task nobody had. Saved kinds are never renamed.
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back', 'due_moved',
      'took', 'clock_started', 'clock_paused', 'clock_fixed'
    )
  );
