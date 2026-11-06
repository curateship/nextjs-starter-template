-- A project's notes, opened from the note icon in the left panel's header
-- (Tyler, 6 Nov 2026: "Add a note feature here ... like in travel app").
-- One row per note, seen by everyone who can see the project. Pins and the
-- order are the same for everyone on it. A deleted note waits in the
-- project's bin for 30 days, like a task.
CREATE TABLE IF NOT EXISTS "project_notes" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "writer_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "body" text NOT NULL DEFAULT '',
  "pinned" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL,
  "deleted_at" timestamp with time zone,
  "deleted_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_notes_project_idx" ON "project_notes" ("project_id");
