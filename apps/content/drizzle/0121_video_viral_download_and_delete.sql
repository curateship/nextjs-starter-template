-- Download and AI analyse as two buttons, and deleting a saved Viral video
-- (polish task, parts 7 and 9, 19 Oct 2026).
--
-- A saved viral video used to have one button, Save & break down, which
-- downloaded the video and then had Gemini watch it. It is now two:
--
--   Download keeps the video in the media library and spends no AI. Its row
--   stops at the new status `downloaded`.
--   AI analyse runs the breakdown, downloading first only when the file is not
--   there yet. A `downloaded` row it is pressed on goes back to `waiting`, and
--   the worker takes it straight to `analysing` without downloading again.
--
-- `wants_analysis` is what the worker reads once the download is in to decide
-- between the two. Every row saved before today was saved with Save & break
-- down, so the column starts true for all of them, and nothing already saved
-- changes.
--
-- The status check is widened by one value, never narrowed: every status a
-- row may already hold is still allowed.
ALTER TABLE "video_viral_videos"
  ADD COLUMN IF NOT EXISTS "wants_analysis" boolean NOT NULL DEFAULT true;

ALTER TABLE "video_viral_videos"
  DROP CONSTRAINT IF EXISTS "ck_video_viral_videos_status";
ALTER TABLE "video_viral_videos"
  ADD CONSTRAINT "ck_video_viral_videos_status" CHECK (
    "status" in ('waiting', 'downloading', 'downloaded', 'analysing', 'ready', 'failed')
  );

-- Deleting a saved video blanks `video_projects.source_viral_video_id` on
-- every editor project Copy this made from it (the key is ON DELETE SET NULL,
-- from 0112). Just before the delete, the app writes the video's title here,
-- so that project's Copy panel can still say "The original video, <title>,
-- was deleted" rather than claiming it never copied anything. It stays empty
-- on every project whose video is still there.
ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "source_viral_video_title" text;
