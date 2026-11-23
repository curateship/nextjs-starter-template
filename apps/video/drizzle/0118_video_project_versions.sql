-- Project history (task features/28).
--
-- A project keeps exactly one timeline, so every save overwrites the last.
-- This table keeps earlier ones. A row is the timeline as it was just before a
-- save replaced it, kept in the same transaction as that save:
--
--   'break'    the timeline had not been saved for 30 minutes or more, so
--              this is the cut somebody came back to.
--   'hourly'   the newest version was an hour old or more.
--   'restore'  what was on the project when an older version was restored,
--              so the restore can itself be undone.
--
-- The app deletes anything past the newest 20 per project after each insert
-- (KEEP_VERSIONS in src/lib/video/project-versions.ts). Deleting the project
-- deletes its versions.
--
-- `aspect`, `clip_count` and `duration_ms` are copied out once when the row
-- is written, so the History list never reads the timelines themselves. `saved_at` is when
-- the kept timeline was last saved, which is the time the list shows;
-- `created_at` is when the row was made, which is what the hourly rule
-- measures from. `user_id` is who made the save.
CREATE TABLE IF NOT EXISTS "video_project_versions" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" varchar(16) NOT NULL,
  "timeline" jsonb NOT NULL,
  "aspect" varchar(8) NOT NULL,
  "clip_count" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "saved_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_video_project_versions_reason"
    CHECK ("reason" IN ('break', 'hourly', 'restore'))
);

-- The list, the hourly rule's "newest version" and the trim all read one
-- project's rows newest first.
CREATE INDEX IF NOT EXISTS "ix_video_project_versions_project_created"
  ON "video_project_versions" ("project_id", "created_at");
