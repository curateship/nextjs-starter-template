-- Finding and sorting tasks (Next features task 03): labels, sections, the
-- project's own order, when a task became Done, and starred projects.

-- Labels belong to the team, so "Bug" means the same in every project. Each
-- uses one of the project colours. Names are unique in a team whatever their
-- capitals, so "bug" and "Bug" can't both exist.
CREATE TABLE IF NOT EXISTS "project_labels" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" varchar(16) NOT NULL,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_labels_team_name"
  ON "project_labels" ("team_id", lower("name"));

CREATE TABLE IF NOT EXISTS "project_task_labels" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "label_id" varchar(36) NOT NULL REFERENCES "project_labels" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("task_id", "label_id")
);
CREATE INDEX IF NOT EXISTS "ix_project_task_labels_label"
  ON "project_task_labels" ("label_id");

-- Sections are one project's own headings. Deleting one leaves its tasks with
-- no section.
CREATE TABLE IF NOT EXISTS "project_sections" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_sections_project"
  ON "project_sections" ("project_id", "position");

ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "section_id" varchar(36)
    REFERENCES "project_sections" ("id") ON DELETE SET NULL,
  -- One order for the whole project, set by dragging. New tasks go last.
  ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0,
  -- When the task last became Done; cleared when it leaves Done. Tasks Done
  -- before this column existed have none, and count as older than 14 days.
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

-- Today's order (due date, then age) becomes each project's starting order.
UPDATE "project_tasks" t
SET "position" = o.n
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "project_id" ORDER BY "due_date" ASC NULLS LAST, "created_at" ASC
  ) AS n
  FROM "project_tasks"
) o
WHERE o."id" = t."id";

CREATE INDEX IF NOT EXISTS "ix_project_tasks_position"
  ON "project_tasks" ("project_id", "position");

-- Each person's own starred projects.
CREATE TABLE IF NOT EXISTS "project_project_stars" (
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "user_id")
);
