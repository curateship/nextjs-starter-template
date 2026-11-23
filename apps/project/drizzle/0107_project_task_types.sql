-- Task types (Task types task 01): the team's own kinds of task, each with
-- its own fields, starting steps and notes.

-- A team's kinds of task, such as "Research" or "Video editing". Names are
-- unique in a team whatever their capitals. A type is archived, never
-- deleted, so its tasks keep their type and their values. `steps` and
-- `notes` fill New task when the type is picked; `notes` is the editor's
-- document, the same as a task's.
CREATE TABLE IF NOT EXISTS "project_task_types" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "icon" varchar(32) NOT NULL,
  "color" varchar(16) NOT NULL,
  "position" integer NOT NULL,
  "archived_at" timestamptz,
  "steps" text[] NOT NULL DEFAULT '{}',
  "notes" text NOT NULL DEFAULT '',
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_task_types_team_name"
  ON "project_task_types" ("team_id", lower("name"));

-- One type's fields. `kind` is text, long_text, number, link, date, dropdown,
-- checkbox, person or file, and never changes once a task has a value in it.
-- `who_can_change` is anyone, assignee or handed_out_by. `settings` holds a
-- dropdown's choices (removed ones stay, so old values still read) and
-- "Show only when".
CREATE TABLE IF NOT EXISTS "project_task_type_fields" (
  "id" varchar(36) PRIMARY KEY,
  "type_id" varchar(36) NOT NULL REFERENCES "project_task_types" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" varchar(16) NOT NULL,
  "position" integer NOT NULL,
  "needed_before_done" boolean NOT NULL DEFAULT false,
  "needed_when_made" boolean NOT NULL DEFAULT false,
  "who_can_change" varchar(16) NOT NULL DEFAULT 'anyone',
  "settings" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_task_type_fields_type_name"
  ON "project_task_type_fields" ("type_id", lower("name"));

-- What a task holds in each field. An empty field has no row. A File field's
-- files are rows in project_task_files instead.
CREATE TABLE IF NOT EXISTS "project_task_field_values" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "field_id" varchar(36) NOT NULL REFERENCES "project_task_type_fields" ("id") ON DELETE CASCADE,
  "value" jsonb NOT NULL,
  "updated_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "field_id")
);
CREATE INDEX IF NOT EXISTS "ix_project_task_field_values_field"
  ON "project_task_field_values" ("field_id");

-- A task's type. Null is a plain task, which every task made before this was.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "type_id" varchar(36)
    REFERENCES "project_task_types" ("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "ix_project_tasks_type" ON "project_tasks" ("type_id");

-- A file that belongs to a File field. It shares the task's storage, limits,
-- download address and bin. The code removes a field's files from storage
-- before it deletes the field.
ALTER TABLE "project_task_files"
  ADD COLUMN IF NOT EXISTS "field_id" varchar(36)
    REFERENCES "project_task_type_fields" ("id") ON DELETE CASCADE;

-- Which of the team's types a project leaves out (none, so every type, by
-- default, and a type made later shows everywhere), and the one New task
-- starts on.
ALTER TABLE "project_projects"
  ADD COLUMN IF NOT EXISTS "hidden_type_ids" text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "default_type_id" varchar(36)
    REFERENCES "project_task_types" ("id") ON DELETE SET NULL;
