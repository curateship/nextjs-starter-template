-- The morning check-in (task file 02). Each person checks in once a day, in
-- their own time zone, and picks the tasks they will work on. History (file
-- 03) reads only these rows, never today's tasks, because a task's status
-- today says nothing about what it was last Tuesday.

-- A person may shift the team's check-in time and time zone to their own
-- hours. Null means "use the team's".
ALTER TABLE "project_team_members"
  ADD COLUMN IF NOT EXISTS "checkin_time" varchar(5),
  ADD COLUMN IF NOT EXISTS "time_zone" text;

ALTER TABLE "project_team_members"
  DROP CONSTRAINT IF EXISTS "project_team_members_checkin_time_format";
ALTER TABLE "project_team_members"
  ADD CONSTRAINT "project_team_members_checkin_time_format"
    CHECK ("checkin_time" IS NULL OR "checkin_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- One row per person per day of their own calendar. A row with no
-- "checked_in_at" is a day the person didn't check in, written by the
-- end-of-day job so the calendar can tell a missed work day from a day off.
-- The team is kept on the row, so a person removed from the team keeps their
-- past days and task history still shows who worked on what.
CREATE TABLE IF NOT EXISTS "project_checkins" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  -- The person's own calendar day, in "time_zone".
  "day" date NOT NULL,
  "time_zone" text NOT NULL,
  -- False on a day the team doesn't work, so the calendar shows a day off.
  "work_day" boolean NOT NULL,
  -- When the person's check-in time fell that day. Checking in after it is late.
  "due_at" timestamptz NOT NULL,
  "checked_in_at" timestamptz,
  -- Set by the end-of-day job once each pick's status has been saved.
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_checkins_user_day"
  ON "project_checkins" ("user_id", "day");

CREATE INDEX IF NOT EXISTS "ix_project_checkins_team_day"
  ON "project_checkins" ("team_id", "day");

-- Days the end-of-day job hasn't saved yet.
CREATE INDEX IF NOT EXISTS "ix_project_checkins_open"
  ON "project_checkins" ("day") WHERE "closed_at" IS NULL AND "checked_in_at" IS NOT NULL;

-- What a check-in holds: each task picked that day, and each task from the
-- last check-in that was dropped, with the reason. The title and project are
-- copied onto the row, so a deleted task still reads as a line in history.
CREATE TABLE IF NOT EXISTS "project_checkin_items" (
  "id" varchar(36) PRIMARY KEY,
  "checkin_id" varchar(36) NOT NULL REFERENCES "project_checkins" ("id") ON DELETE CASCADE,
  "task_id" varchar(36) REFERENCES "project_tasks" ("id") ON DELETE SET NULL,
  "project_id" varchar(36) REFERENCES "project_projects" ("id") ON DELETE SET NULL,
  "task_title" text NOT NULL,
  -- 'pick' is a task worked on that day; 'drop' is one let go from the last check-in.
  "kind" varchar(8) NOT NULL,
  -- A pick carried over from the last check-in rather than picked fresh.
  "carried_over" boolean NOT NULL DEFAULT false,
  -- Why a dropped task was let go.
  "reason" text,
  -- A pick's status when the person's day ended. Null until the day is saved.
  "end_status" varchar(16),
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "project_checkin_items_kind" CHECK ("kind" IN ('pick', 'drop')),
  CONSTRAINT "project_checkin_items_drop_reason" CHECK ("kind" = 'pick' OR "reason" IS NOT NULL),
  CONSTRAINT "project_checkin_items_end_status"
    CHECK ("end_status" IS NULL OR "end_status" IN ('todo', 'doing', 'done', 'stuck'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_checkin_items_task"
  ON "project_checkin_items" ("checkin_id", "task_id");

CREATE INDEX IF NOT EXISTS "ix_project_checkin_items_task"
  ON "project_checkin_items" ("task_id");

-- One reminder per person per day. The job writes this row before the bell
-- notice, in the same transaction, so two overlapping passes can't both send.
CREATE TABLE IF NOT EXISTS "project_checkin_reminders" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "sent_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "day")
);
