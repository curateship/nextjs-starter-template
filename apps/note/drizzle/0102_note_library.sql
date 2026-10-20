-- Libraries: Videos, Notes and Posts become one kind of note (Tyler, 20 Oct
-- 2026: "collapse video and post into notes"). A note is written by hand, or
-- imported from a YouTube, Instagram, TikTok or X link, and lives in one of
-- its owner's libraries, in a folder or loose.
--
-- The videos, posts and notes saved before are deleted, not converted (Tyler:
-- "Start fresh, delete them", "Delete them too"). Every old table is dropped
-- with IF EXISTS, because a local database may also have run two migrations
-- that were thrown away the same morning (0102_note_video_views.sql, which
-- made note_video_views, and 0103_note_videos_drop_folders.sql, which dropped
-- note_folders). The files those rows stored stay in the media library.
--
-- Everything is per person. Each table points at the person who owns it, or
-- at something that does, and goes with them when the account is deleted.

DELETE FROM "notifications"
WHERE "id" IN (SELECT "notice_id" FROM "note_notice_links");
DROP TABLE IF EXISTS "note_notice_links";

DROP TABLE IF EXISTS "note_note_reminders";
DROP TABLE IF EXISTS "note_note_links";
DROP TABLE IF EXISTS "note_note_versions";
DROP TABLE IF EXISTS "note_note_views";
DROP TABLE IF EXISTS "note_note_templates";
DROP TABLE IF EXISTS "note_note_fields";
DROP TABLE IF EXISTS "note_notes";
DROP TABLE IF EXISTS "note_note_folders";
DROP TABLE IF EXISTS "note_posts";
DROP TABLE IF EXISTS "note_post_folders";
DROP TABLE IF EXISTS "note_video_views";
DROP TABLE IF EXISTS "note_videos";
DROP TABLE IF EXISTS "note_folders";

-- A library. Its name is one of a kind for its owner, whatever its capitals.
-- `last_opened_at` says which library the Save from x.com button saves into.
CREATE TABLE "note_libraries" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "colour" varchar(20) NOT NULL DEFAULT 'slate',
  "avatar_url" text,
  "banner_url" text,
  "pinned_at" timestamptz,
  "last_opened_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "ux_note_libraries_owner_name" ON "note_libraries" ("owner_id", lower("name"));

-- A library's folders, one level. `source` is set on the folder an import
-- made for its source ("YouTube short"), so renaming it keeps it in use.
CREATE TABLE "note_folders" (
  "id" varchar(36) PRIMARY KEY,
  "library_id" varchar(36) NOT NULL REFERENCES "note_libraries" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "source" varchar(20),
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "ux_note_folders_library_name" ON "note_folders" ("library_id", lower("name"));
CREATE UNIQUE INDEX "ux_note_folders_library_source" ON "note_folders" ("library_id", "source")
  WHERE "source" IS NOT NULL;

-- One note. The same link imported twice into one library is one note; the
-- same link may sit in two libraries.
CREATE TABLE "note_notes" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "library_id" varchar(36) NOT NULL REFERENCES "note_libraries" ("id") ON DELETE CASCADE,
  "folder_id" varchar(36) REFERENCES "note_folders" ("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL,
  "body_text" text NOT NULL DEFAULT '',
  "words" integer NOT NULL DEFAULT 0,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "priority" varchar(10) NOT NULL DEFAULT 'normal',
  "source" varchar(20) NOT NULL DEFAULT 'note',
  "source_url" text,
  "platform_id" varchar(200),
  "import_status" varchar(20),
  "import_error" text,
  "analyse_status" varchar(20),
  "analyse_error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "video_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "media_kind" varchar(10),
  "cover_path" text,
  "duration_seconds" integer,
  "posted_at" timestamptz,
  "language" varchar(20),
  "author_name" text,
  "author_handle" varchar(100),
  "author_picture_path" text,
  "post_text" text,
  "pictures" jsonb,
  "quoted" jsonb,
  "thread" jsonb,
  "thread_status" varchar(10) NOT NULL DEFAULT 'none',
  "likes_when_saved" integer,
  "reposts_when_saved" integer,
  "video_status" varchar(20) NOT NULL DEFAULT 'none',
  "video_error" text,
  "video_source_url" text,
  "highlights" jsonb,
  "transcript" jsonb,
  "transcript_text" text,
  "summary" jsonb,
  "action_plan" jsonb,
  "quotes" jsonb,
  "analysed_at" timestamptz,
  "merged_from" jsonb,
  "pinned_at" timestamptz,
  "archived_at" timestamptz,
  "deleted_at" timestamptz,
  "last_opened_at" timestamptz,
  "revision" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ck_note_notes_priority" CHECK ("priority" IN ('high', 'normal', 'low')),
  CONSTRAINT "ck_note_notes_source" CHECK (
    "source" IN ('note', 'youtube_long', 'youtube_short', 'instagram', 'tiktok', 'x')
  ),
  CONSTRAINT "ck_note_notes_import_status" CHECK (
    "import_status" IN ('waiting', 'reading', 'downloading', 'saved', 'failed')
  ),
  CONSTRAINT "ck_note_notes_analyse_status" CHECK (
    "analyse_status" IN ('queued', 'transcribing', 'summarising', 'ready', 'failed')
  ),
  CONSTRAINT "ck_note_notes_video_status" CHECK (
    "video_status" IN ('none', 'waiting', 'downloading', 'saved', 'failed', 'too_long')
  ),
  CONSTRAINT "ck_note_notes_thread_status" CHECK ("thread_status" IN ('none', 'whole', 'cut'))
);
CREATE INDEX "ix_note_notes_library" ON "note_notes" ("library_id", "deleted_at", "updated_at");
CREATE INDEX "ix_note_notes_import" ON "note_notes" ("import_status", "updated_at");
CREATE INDEX "ix_note_notes_analyse" ON "note_notes" ("analyse_status", "updated_at");
-- Trash is a date: the worker deletes for good what has sat there 30 days.
CREATE INDEX "ix_note_notes_trash" ON "note_notes" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE UNIQUE INDEX "ux_note_notes_library_link" ON "note_notes" ("library_id", "source", "platform_id")
  WHERE "platform_id" IS NOT NULL;

-- A library's templates: what a new note starts with.
CREATE TABLE "note_templates" (
  "id" varchar(36) PRIMARY KEY,
  "library_id" varchar(36) NOT NULL REFERENCES "note_libraries" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

-- A library's saved views: a name and the Filter popover's picks.
CREATE TABLE "note_views" (
  "id" varchar(36) PRIMARY KEY,
  "library_id" varchar(36) NOT NULL REFERENCES "note_libraries" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "ux_note_views_library_name" ON "note_views" ("library_id", lower("name"));

-- Earlier copies of a note's title and text, up to 100 a note.
CREATE TABLE "note_versions" (
  "id" varchar(36) PRIMARY KEY,
  "note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL,
  "words" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX "ix_note_versions_note" ON "note_versions" ("note_id", "created_at");

-- Which note links to which with "[[".
CREATE TABLE "note_links" (
  "from_note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  "to_note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("from_note_id", "to_note_id")
);
CREATE INDEX "ix_note_links_to" ON "note_links" ("to_note_id");

-- Which note a bell notice is about, so clicking it opens that one.
CREATE TABLE "note_notice_links" (
  "notice_id" varchar(36) PRIMARY KEY REFERENCES "notifications" ("id") ON DELETE CASCADE,
  "note_id" varchar(36) NOT NULL REFERENCES "note_notes" ("id") ON DELETE CASCADE
);
