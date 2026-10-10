-- Project's own tables: teams, their people and invites, projects, and tasks.
-- The team is the top level. There is no workspace in Project; the shell's
-- own "workspaces" table is a different thing and nothing here points at it.

CREATE TABLE IF NOT EXISTS "project_teams" (
  "id" varchar(36) PRIMARY KEY,
  "name" text NOT NULL,
  -- "HH:MM" in the team's time zone. File 02 sends the check-in reminder.
  "checkin_time" varchar(5) NOT NULL DEFAULT '09:00',
  "time_zone" text NOT NULL DEFAULT 'UTC',
  -- Days of the week the team works, 0 = Sunday … 6 = Saturday.
  "work_days" smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "project_teams_checkin_time_format"
    CHECK ("checkin_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE TABLE IF NOT EXISTS "project_team_members" (
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "role" varchar(16) NOT NULL,
  "joined_at" timestamptz NOT NULL,
  PRIMARY KEY ("team_id", "user_id"),
  CONSTRAINT "project_team_members_role" CHECK ("role" IN ('owner', 'admin', 'member'))
);

-- One team per account. Switching between teams is the later workspace
-- switcher's job, not version 1's.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_team_members_user"
  ON "project_team_members" ("user_id");

-- Exactly one owner per team at most.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_team_members_owner"
  ON "project_team_members" ("team_id") WHERE "role" = 'owner';

CREATE TABLE IF NOT EXISTS "project_team_invites" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  -- Stored lower case, so one address has one invite per team.
  "email" text NOT NULL,
  "role" varchar(16) NOT NULL,
  -- sha256 of the link's secret. The secret itself is only ever in the email.
  "token_hash" varchar(64) NOT NULL,
  "invited_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL,
  "sent_at" timestamptz NOT NULL,
  CONSTRAINT "project_team_invites_role" CHECK ("role" IN ('admin', 'member'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_team_invites_team_email"
  ON "project_team_invites" ("team_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_team_invites_token"
  ON "project_team_invites" ("token_hash");
CREATE INDEX IF NOT EXISTS "ix_project_team_invites_email"
  ON "project_team_invites" ("email");

CREATE TABLE IF NOT EXISTS "project_projects" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" varchar(16) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "archived_at" timestamptz,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_project_projects_team"
  ON "project_projects" ("team_id");

-- Only a project's members see it. The team's owner and admins see every
-- project without being listed here.
CREATE TABLE IF NOT EXISTS "project_project_members" (
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "added_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_project_project_members_user"
  ON "project_project_members" ("user_id");

CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "status" varchar(16) NOT NULL DEFAULT 'todo',
  "stuck_reason" text,
  "assignee_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  -- Who handed the task to its assignee. Set only when the assignee changes.
  "assigned_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  -- Null while a task handed to someone else is Waiting for them to accept.
  "accepted_at" timestamptz,
  "handed_back_reason" text,
  "handed_back_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  -- The name of the person the task was assigned to when they left the team
  -- or the project, so the task still says whose it was.
  "former_assignee_name" text,
  "due_date" date,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "project_tasks_status" CHECK ("status" IN ('todo', 'doing', 'done', 'stuck')),
  CONSTRAINT "project_tasks_stuck_reason"
    CHECK ("status" <> 'stuck' OR "stuck_reason" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ix_project_tasks_project"
  ON "project_tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "ix_project_tasks_assignee"
  ON "project_tasks" ("assignee_user_id");

CREATE TABLE IF NOT EXISTS "project_task_steps" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_project_task_steps_task"
  ON "project_task_steps" ("task_id", "position");

CREATE TABLE IF NOT EXISTS "project_task_comments" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "author_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_project_task_comments_task"
  ON "project_task_comments" ("task_id", "created_at");

-- What a Project bell notice is and where it opens. The shell's notifications
-- row holds the words; this row holds the rest.
CREATE TABLE IF NOT EXISTS "project_notice_links" (
  "notice_id" varchar(36) PRIMARY KEY REFERENCES "notifications" ("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "href" text NOT NULL
);

-- Which menus have been given Project's links: 'members' for the members'
-- menu, 'workspace:<id>' for an admin's. Each is added once, so an admin who
-- later removes a link in Settings keeps it removed.
CREATE TABLE IF NOT EXISTS "project_navigation_added" (
  "scope" varchar(80) PRIMARY KEY,
  "added_at" timestamptz NOT NULL
);
