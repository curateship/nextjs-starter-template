-- More for projects (task 06): a status with a reason, a named lead,
-- milestones, a client name, whole-team projects and saved templates.

-- The project's status: On track, At risk or Off track, with one line of why,
-- who set it and when. Null is no status, which shows nothing.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "health" varchar(16);
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "health_note" varchar(200);
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "health_by_user_id" varchar(36)
  REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "health_at" timestamptz;
ALTER TABLE "project_projects" DROP CONSTRAINT IF EXISTS "project_projects_health";
ALTER TABLE "project_projects"
  ADD CONSTRAINT "project_projects_health" CHECK (
    "health" IS NULL OR "health" IN ('on_track', 'at_risk', 'off_track')
  );

-- The one member answerable for the project. Leaving the project or the team
-- clears it in the code; deleting the account clears it here.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "lead_user_id" varchar(36)
  REFERENCES "users" ("id") ON DELETE SET NULL;

-- The client's name, typed or picked from the team's earlier ones. A name,
-- not a client record.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "client" varchar(60);

-- Everyone on the team is a member, including people who join later.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "whole_team" boolean NOT NULL DEFAULT false;

-- A project's milestones: a name and an optional date. A copied project's
-- milestones have no date, the same rule as its tasks.
CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "due_date" date,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_milestones_project" ON "project_milestones" ("project_id");

-- A task belongs to at most one milestone. Deleting the milestone frees it.
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "milestone_id" varchar(36)
  REFERENCES "project_milestones" ("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "ix_project_tasks_milestone"
  ON "project_tasks" ("milestone_id") WHERE "milestone_id" IS NOT NULL;

-- Moments that belong to the project rather than one task, for its Activity
-- tab. The first kind is a status change; `health` holds the new status
-- (null when it was taken off) and `note` its line of why.
CREATE TABLE IF NOT EXISTS "project_project_events" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "actor_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "health" varchar(16),
  "note" varchar(200),
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "project_project_events_kind" CHECK ("kind" IN ('health_set'))
);
CREATE INDEX IF NOT EXISTS "ix_project_project_events_project"
  ON "project_project_events" ("project_id", "created_at" DESC);

-- Saved project templates. `content` is a copy taken when it was saved, so
-- changing the source project later never changes the template.
CREATE TABLE IF NOT EXISTS "project_templates" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "content" jsonb NOT NULL,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_templates_team" ON "project_templates" ("team_id");
