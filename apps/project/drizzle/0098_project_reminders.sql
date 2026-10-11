-- Due-date reminders and the team's morning notice (Next features task 02).
--
-- Each reminder is claimed by writing its row in the same transaction as the
-- bell notice, so two overlapping passes of the job send one. A task's
-- reminder is for one due date: moving the date makes a fresh row possible,
-- so the person hears about the new day too.
CREATE TABLE IF NOT EXISTS "project_due_reminders" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "due_date" date NOT NULL,
  "sent_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "kind", "due_date"),
  CONSTRAINT "project_due_reminders_kind" CHECK ("kind" IN ('due_soon', 'overdue'))
);

-- One morning notice per team per day, to its owner and admins.
CREATE TABLE IF NOT EXISTS "project_team_morning_notices" (
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "sent_at" timestamptz NOT NULL,
  PRIMARY KEY ("team_id", "day")
);
