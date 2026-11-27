-- Brief to video (task ai-generation/08-brief-to-video).
--
-- One row per brief: what the video is about, who it is for, how long, the
-- platform, the voice and the picture model, then the script the writer made
-- from it, cut into scenes. The scenes are kept as one list on the row, each
-- with where it is up to (draft, queued, made, placed or failed) and whatever
-- has been made for it so far, so the storyboard reopens exactly as it was
-- left and costs nothing to reopen.
--
--   check / check_error  The script check's answer (task 01), or why it
--                        could not be run.
--   status               draft while the storyboard is edited, making while
--                        the background job makes the scenes, then stopped
--                        (a scene failed) or done.
--   landing              Set when Make it is pressed: where scene one starts
--                        on the timeline, and the three lanes the scenes go
--                        on once they exist.
--   lease_token /        The background job's claim, renewed after every
--   lease_expires_at     scene, so a worker killed mid-way leaves a lease to
--                        take back rather than a brief stuck half made.
--
-- Deleting the project or the person deletes their briefs. The files a brief
-- made are ordinary Media files and stay.
CREATE TABLE IF NOT EXISTS "video_briefs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "about" text NOT NULL,
  "audience" text DEFAULT '' NOT NULL,
  "length_seconds" integer NOT NULL,
  "platform" varchar(16) NOT NULL,
  "voice" jsonb NOT NULL,
  "picture_model" varchar(100) NOT NULL,
  "title" text NOT NULL,
  "hook" text NOT NULL,
  "scenes" jsonb NOT NULL,
  "check" jsonb,
  "check_error" text,
  "status" varchar(8) NOT NULL,
  "landing" jsonb,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_briefs_status_check"
    CHECK ("status" in ('draft', 'making', 'stopped', 'done'))
);

CREATE INDEX IF NOT EXISTS "ix_video_briefs_project"
  ON "video_briefs" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_briefs_status"
  ON "video_briefs" ("status");
