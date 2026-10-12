-- Planning tasks (More features task 05): priority, more repeat choices,
-- waiting on several tasks, due date moves in history, personal reminders
-- and saved step lists.

-- High, Normal or Low. Every task, old ones included, starts Normal.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "priority" varchar(8) NOT NULL DEFAULT 'normal';
ALTER TABLE "project_tasks" DROP CONSTRAINT IF EXISTS "project_tasks_priority";
ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_priority" CHECK ("priority" IN ('high', 'normal', 'low'));

-- Three more ways to repeat. The saved values keep their names; the column
-- widens so "last_workday" fits. `repeat_from` is the day the rule counts
-- from: the week an every-2-weeks rule was set in, or the first date of an
-- every-3-months rule. Every copy carries it, so the weeks and months never
-- drift.
ALTER TABLE "project_tasks" ALTER COLUMN "repeat_every" TYPE varchar(16);
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "repeat_from" date;
ALTER TABLE "project_tasks" DROP CONSTRAINT IF EXISTS "project_tasks_repeat_every";
ALTER TABLE "project_tasks"
  ADD CONSTRAINT "project_tasks_repeat_every" CHECK (
    "repeat_every" IS NULL OR "repeat_every" IN (
      'workday', 'week', 'month', 'two_weeks', 'quarter', 'last_workday'
    )
  );

-- A task waits on up to 10 others. Each link is a row; deleting either task
-- for good takes the link with it.
CREATE TABLE IF NOT EXISTS "project_task_waits" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "waiting_on_task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "waiting_on_task_id"),
  CONSTRAINT "project_task_waits_not_itself" CHECK ("task_id" <> "waiting_on_task_id")
);
CREATE INDEX IF NOT EXISTS "ix_project_task_waits_waiting_on"
  ON "project_task_waits" ("waiting_on_task_id");

-- Every single link made before now becomes a list of one. The old column
-- stays, unread and unwritten, until the move is proven on the live
-- database; a later migration drops it.
INSERT INTO "project_task_waits" ("task_id", "waiting_on_task_id", "created_at")
SELECT "id", "waiting_on_task_id", "updated_at"
FROM "project_tasks"
WHERE "waiting_on_task_id" IS NOT NULL AND "waiting_on_task_id" <> "id"
ON CONFLICT DO NOTHING;

-- A due date moved from one day to another is a moment in the task's
-- history. Its reason holds the two days, "2026-11-03 2026-11-10".
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back', 'due_moved'
    )
  );
CREATE INDEX IF NOT EXISTS "ix_project_task_events_due_moved"
  ON "project_task_events" ("task_id") WHERE "kind" = 'due_moved';

-- "Remind me": one per person per task, on a day they pick, sent at their own
-- check-in time. The row is deleted as the bell notice is written, so it is
-- sent once.
CREATE TABLE IF NOT EXISTS "project_task_reminders" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "ix_project_task_reminders_day" ON "project_task_reminders" ("day");

-- The team's saved step lists, such as "Payroll". Names are unique in a team
-- whatever their capitals.
CREATE TABLE IF NOT EXISTS "project_step_lists" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "steps" text[] NOT NULL,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_step_lists_team_name"
  ON "project_step_lists" ("team_id", lower("name"));
