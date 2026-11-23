-- The picture beside each project on the projects list.
--
-- It is one frame of the first video or picture clip on the timeline, made by
-- the background worker rather than on save, because saving happens every few
-- seconds while somebody edits and a frame costs an ffmpeg pass. This table is
-- the worker's queue as well as the record of the picture, one row a project.
--
-- `source_media_id` and `source_at_ms` say which file and which moment of it
-- the picture is (or is about to be) taken from. The worker compares them with
-- the timeline after every save, and only a different first clip queues a new
-- picture. `checked_at` is the project's own `updated_at` at that comparison,
-- so a save that lands while the worker is looking is still seen next time.
--
-- `none` is a project with nothing to take a frame of: only sound, only words,
-- or nothing at all. It is never attempted, so it never piles up attempts.
--
-- The picture lives in storage under `video/project-thumbnails/`, like export
-- covers, and never in the media library.
CREATE TABLE IF NOT EXISTS "video_project_thumbnails" (
  "project_id" varchar(36) PRIMARY KEY
    REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL,
  "source_media_id" varchar(36),
  "source_at_ms" integer,
  "storage_path" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "checked_at" timestamptz NOT NULL,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_project_thumbnails_status_check"
    CHECK ("status" IN ('queued', 'generating', 'ready', 'error', 'none')),
  CONSTRAINT "video_project_thumbnails_ready_check"
    CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ix_video_project_thumbnails_status"
  ON "video_project_thumbnails" ("status", "updated_at");

-- The old plan pointed at a media library picture. Nothing ever set it, so it
-- was empty on every project, and the picture now lives in the table above.
DROP INDEX IF EXISTS "ix_video_projects_thumbnail_media_id";
ALTER TABLE "video_projects" DROP COLUMN IF EXISTS "thumbnail_media_id";
