-- Written notes: a person's own notes, the folders they keep them in (folders
-- can sit inside folders), each folder's own fields like a Notion database,
-- its saved views and templates, earlier copies of each note, which notes
-- link to which, and date reminders.
--
-- Everything is per person. Each table points at the person who owns it, or
-- at something that does, and goes with them when the account is deleted.
--
-- Trash is a date, not a table: a note or folder in Trash has `deleted_at`
-- set, and the worker removes it for good 30 days later (Tyler, 18 Oct 2026).
-- A folder sent to Trash takes everything under it along, and each of those
-- rows remembers the folder it went with in `trashed_with_folder_id`, so
-- restoring the folder brings back exactly what went with it.

CREATE TABLE IF NOT EXISTS "note_note_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  -- Null at the top. A folder deleted for good takes the folders inside it.
  "parent_id" varchar(36) REFERENCES "note_note_folders" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "icon" varchar(40),
  "position" integer NOT NULL DEFAULT 0,
  "deleted_at" timestamptz,
  "trashed_with_folder_id" varchar(36),
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

-- Two folders side by side cannot share a name, whatever its capitals. A
-- folder in Trash no longer holds its name.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_note_folders_owner_parent_name"
  ON "note_note_folders" ("owner_id", coalesce("parent_id", ''), lower("name"))
  WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "ix_note_note_folders_owner"
  ON "note_note_folders" ("owner_id");
CREATE INDEX IF NOT EXISTS "ix_note_note_folders_deleted"
  ON "note_note_folders" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;

-- A folder's fields. `key` is fixed when the field is made and the notes'
-- values are stored under it, so renaming a field keeps every value.
CREATE TABLE IF NOT EXISTS "note_note_fields" (
  "id" varchar(36) PRIMARY KEY,
  "folder_id" varchar(36) NOT NULL REFERENCES "note_note_folders" ("id") ON DELETE CASCADE,
  "key" varchar(60) NOT NULL,
  "name" varchar(60) NOT NULL,
  "type" varchar(20) NOT NULL,
  -- [{ id, label, colour }] for the two choice types, [] for the rest.
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Date fields only: ring the bell on the day.
  "remind" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ck_note_note_fields_type" CHECK (
    "type" IN ('text', 'number', 'checkbox', 'select', 'multi_select', 'date', 'url', 'email', 'phone')
  ),
  CONSTRAINT "ck_note_note_fields_remind" CHECK (NOT "remind" OR "type" = 'date')
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_note_fields_folder_key"
  ON "note_note_fields" ("folder_id", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_note_fields_folder_name"
  ON "note_note_fields" ("folder_id", lower("name"));

-- One written note.
CREATE TABLE IF NOT EXISTS "note_notes" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  -- Null for a loose note, which has no fields.
  "folder_id" varchar(36) REFERENCES "note_note_folders" ("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL DEFAULT '',
  "icon" varchar(40),
  "cover_url" text,
  -- The editor's own JSON document, checked against the editor's blocks on
  -- every save. Never HTML.
  "body" jsonb NOT NULL,
  -- The words of the body, one block a line, for search and the word count.
  "body_text" text NOT NULL DEFAULT '',
  "first_line" varchar(200) NOT NULL DEFAULT '',
  "checklist_done" integer NOT NULL DEFAULT 0,
  "checklist_total" integer NOT NULL DEFAULT 0,
  "words" integer NOT NULL DEFAULT 0,
  -- { fieldKey: value }, only for fields the folder has.
  "field_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The values as words with their field names, for search.
  "fields_text" text NOT NULL DEFAULT '',
  "video_id" varchar(36) REFERENCES "note_videos" ("id") ON DELETE SET NULL,
  -- The linked video's title when it was linked. With video_id gone it says
  -- the video was deleted.
  "video_title" text,
  "pinned_at" timestamptz,
  "archived_at" timestamptz,
  "deleted_at" timestamptz,
  "trashed_with_folder_id" varchar(36),
  "last_opened_at" timestamptz,
  -- Goes up by one on every save. A save that started from an older number
  -- is refused, so two tabs never quietly overwrite each other.
  "revision" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_note_notes_owner_folder"
  ON "note_notes" ("owner_id", "folder_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_note_notes_owner_opened"
  ON "note_notes" ("owner_id", "last_opened_at")
  WHERE "last_opened_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_note_notes_deleted"
  ON "note_notes" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_note_notes_video"
  ON "note_notes" ("video_id")
  WHERE "video_id" IS NOT NULL;

-- A folder's templates: a title, a body and field values a new note starts with.
CREATE TABLE IF NOT EXISTS "note_note_templates" (
  "id" varchar(36) PRIMARY KEY,
  "folder_id" varchar(36) NOT NULL REFERENCES "note_note_folders" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL,
  "field_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_note_note_templates_folder"
  ON "note_note_templates" ("folder_id");

-- A folder's saved views: a way of looking with its filters, sort, board
-- grouping and column totals.
CREATE TABLE IF NOT EXISTS "note_note_views" (
  "id" varchar(36) PRIMARY KEY,
  "folder_id" varchar(36) NOT NULL REFERENCES "note_note_folders" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "kind" varchar(10) NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sort" jsonb,
  "group_by" varchar(60),
  "totals" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ck_note_note_views_kind" CHECK ("kind" IN ('list', 'table', 'board'))
);

CREATE INDEX IF NOT EXISTS "ix_note_note_views_folder"
  ON "note_note_views" ("folder_id");

-- Earlier copies of a note: at most one per five minutes of editing, the
-- newest 100 kept (Tyler, 18 Oct 2026).
CREATE TABLE IF NOT EXISTS "note_note_versions" (
  "id" varchar(36) PRIMARY KEY,
  "note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL,
  "field_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "words" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_note_note_versions_note"
  ON "note_note_versions" ("note_id", "created_at");

-- Which note links to which, rewritten from the body on every save.
CREATE TABLE IF NOT EXISTS "note_note_links" (
  "from_note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  "to_note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("from_note_id", "to_note_id")
);

CREATE INDEX IF NOT EXISTS "ix_note_note_links_to"
  ON "note_note_links" ("to_note_id");

-- A date reminder: due at 9:00 in the person's own time zone on the day, or
-- at the date's own time. Sent once.
CREATE TABLE IF NOT EXISTS "note_note_reminders" (
  "id" varchar(36) PRIMARY KEY,
  "note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  "field_key" varchar(60) NOT NULL,
  "due_at" timestamptz NOT NULL,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_note_reminders_note_field"
  ON "note_note_reminders" ("note_id", "field_key");
CREATE INDEX IF NOT EXISTS "ix_note_note_reminders_due"
  ON "note_note_reminders" ("due_at")
  WHERE "sent_at" IS NULL;

-- A bell notice is about a video or, from now on, a note. Exactly one of the two.
ALTER TABLE "note_notice_links" ALTER COLUMN "video_id" DROP NOT NULL;
ALTER TABLE "note_notice_links"
  ADD COLUMN IF NOT EXISTS "note_id" varchar(36) REFERENCES "note_notes" ("id") ON DELETE CASCADE;
ALTER TABLE "note_notice_links" DROP CONSTRAINT IF EXISTS "ck_note_notice_links_one";
ALTER TABLE "note_notice_links"
  ADD CONSTRAINT "ck_note_notice_links_one" CHECK (num_nonnulls("video_id", "note_id") = 1);
