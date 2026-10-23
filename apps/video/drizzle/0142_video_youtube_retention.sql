-- The retention curve over the timeline
-- (workspace/tasks/ai-generation/14-retention-curve-over-the-timeline.md;
-- workspace/docs/retention-curve.md). The app signs in to one YouTube channel,
-- an export is told which YouTube video it became, and the curve YouTube
-- measured for that video is read once and kept with the export.
--
-- video_settings
--   youtube_oauth_client  The Google sign-in client pasted on Settings →
--                         YouTube: {"clientId": "...", "clientSecret": "<scrambled>"}.
--                         NULL until somebody pastes one.
--   youtube_oauth         The connected channel: {"refreshToken": "<scrambled>",
--                         "channelId", "channelTitle", "connectedAt"}. NULL
--                         when no channel is connected; Disconnect sets it back
--                         to NULL. Neither secret ever leaves the server.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "youtube_oauth_client" jsonb;
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "youtube_oauth" jsonb;

-- video_render_jobs.scenes  Where the picture changes in the file, worked out
--   by the render from the timeline it drew: [{"startMs", "endMs", "name"}].
--   NULL on exports made before this and on carousels; those draw their scene
--   lines from the project as it is now.
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "scenes" jsonb;

-- One row per export that was posted on YouTube, written when its link is
-- pasted. The curve and the two totals are NULL until they are first read,
-- and read_at says when they were. Deleting the export deletes the row.
--
--   youtube_video_id      The video on YouTube, checked to belong to the
--                         channel named in channel_id when it was pasted.
--   points                [{"ratio", "watch", "relative"}]: how far into the
--                         video (0 to 1), how many still watching per viewer,
--                         and how it holds against videos of the same length
--                         (0.5 is typical). Up to 100 of them.
--   views                 Views YouTube counted, as of read_at.
--   average_view_seconds  How long a view lasted, typically, as of read_at.
CREATE TABLE IF NOT EXISTS "video_export_youtube" (
  "export_id" varchar(36) PRIMARY KEY
    REFERENCES "video_render_jobs"("id") ON DELETE CASCADE,
  "youtube_video_id" varchar(20) NOT NULL,
  "channel_id" varchar(64) NOT NULL,
  "video_title" varchar(200) NOT NULL,
  "published_at" timestamp with time zone NOT NULL,
  "length_seconds" integer NOT NULL,
  "points" jsonb,
  "views" bigint,
  "average_view_seconds" integer,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_export_youtube_length_check" CHECK ("length_seconds" >= 0)
);
