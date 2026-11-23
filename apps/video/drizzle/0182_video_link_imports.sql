-- Import from a link (workspace/docs/import-from-a-link.md): a TikTok,
-- Instagram or YouTube link pasted into a video project's Media panel. One row
-- per video per project, which is what makes a second paste of the same post
-- "Already in this project". The background worker downloads it with yt-dlp,
-- stores the file in the media library and puts it on the project's shelf.
--
-- Deleting the file deletes the row, so the same link can be imported again.

CREATE TABLE IF NOT EXISTS "video_link_imports" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "collection_id" varchar(36) REFERENCES "video_media_collections"("id") ON DELETE SET NULL,
  "status" varchar(20) NOT NULL,
  "error" text,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE CASCADE,
  "title" text,
  "handle" varchar(100),
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_video_link_imports_status" CHECK ("status" in ('waiting', 'downloading', 'done', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_link_imports_project_video"
  ON "video_link_imports" ("project_id", "platform", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_video_link_imports_status"
  ON "video_link_imports" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_link_imports_media_id"
  ON "video_link_imports" ("media_id");
