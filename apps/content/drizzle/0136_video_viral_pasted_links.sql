-- Paste a link in (task viral/08-paste-a-link-in).
--
-- A video pasted into a Viral project by its link is saved and broken down
-- like any other (video_viral_videos), and shows in the project it was pasted
-- into. A saved video belongs to its owner, not to a project, so which
-- projects it was pasted into is a table of its own:
--
--   video_viral_project_links  One row per project and pasted video. Deleting
--                              either takes the row with it; deleting the
--                              project never deletes the saved video.
--
-- Two numbers yt-dlp already answers with are now kept on the saved video,
-- because a pasted video has no search result to borrow them from:
--
--   channel_id   The channel's own id (YouTube's UC… id), or @handle on
--                TikTok and Instagram, the same stand-in followed creators
--                use. Hiding a pasted video's channel needs it.
--   subscribers  The channel's follower count, for the score's "views
--                against followers" part. Null where the platform hides it.
--
-- Additions only. Rows saved before this keep both columns empty until they
-- are downloaded again.
CREATE TABLE IF NOT EXISTS "video_viral_project_links" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_viral_projects"("id") ON DELETE CASCADE,
  "saved_video_id" varchar(36) NOT NULL REFERENCES "video_viral_videos"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("project_id", "saved_video_id")
);
CREATE INDEX IF NOT EXISTS "ix_video_viral_project_links_saved_video"
  ON "video_viral_project_links" ("saved_video_id");

ALTER TABLE "video_viral_videos"
  ADD COLUMN IF NOT EXISTS "channel_id" varchar(100);

ALTER TABLE "video_viral_videos"
  ADD COLUMN IF NOT EXISTS "subscribers" bigint;
