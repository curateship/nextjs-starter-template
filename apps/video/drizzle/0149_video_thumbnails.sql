-- The Thumbnail section of the video editor (workspace/tasks/thumbnail/
-- 01-thumbnail-and-blur-features.md, parts 6, 7, 10, 20, 21 and 23;
-- workspace/docs/thumbnails.md).
--
-- `video_thumbnails` holds every thumbnail made for one video: its shape,
-- its layers as validated JSON (the carousel layer format plus the board's
-- own kinds), the title picked for it and its last AI check. `is_main` marks
-- the one used for the Videos tab picture and the export cover, one wide and
-- one tall per video at most. Only a main thumbnail keeps a finished picture
-- in the media library (`media_id`), so drafts never fill it.
--
-- `video_thumbnail_templates` is a layout anybody on the site can start
-- from: words, styles and shapes, with empty spots where pictures go.
--
-- `video_render_jobs.cover_by_hand` says an export's cover was set from its
-- own frame with "Use this moment", so a main thumbnail starred later leaves
-- it alone. Exports made before this read as not set by hand.
CREATE TABLE IF NOT EXISTS "video_thumbnails" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "video_id" varchar(36) NOT NULL REFERENCES "video_project_videos"("id") ON DELETE CASCADE,
  "shape" varchar(8) NOT NULL,
  "background_color" varchar(7) NOT NULL DEFAULT '#000000',
  "layers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_main" boolean NOT NULL DEFAULT false,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "title" varchar(200),
  "check" jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_thumbnails_shape_check" CHECK ("shape" in ('wide', 'tall')),
  CONSTRAINT "video_thumbnails_version_check" CHECK ("version" >= 1)
);
CREATE INDEX IF NOT EXISTS "ix_video_thumbnails_video_created"
  ON "video_thumbnails" ("video_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_thumbnails_one_main"
  ON "video_thumbnails" ("video_id", "shape") WHERE "is_main";

CREATE TABLE IF NOT EXISTS "video_thumbnail_templates" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "shape" varchar(8) NOT NULL,
  "background_color" varchar(7) NOT NULL DEFAULT '#000000',
  "layers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_thumbnail_templates_shape_check" CHECK ("shape" in ('wide', 'tall'))
);
CREATE INDEX IF NOT EXISTS "ix_video_thumbnail_templates_workspace"
  ON "video_thumbnail_templates" ("workspace_id", "created_at");

ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "cover_by_hand" boolean NOT NULL DEFAULT false;
