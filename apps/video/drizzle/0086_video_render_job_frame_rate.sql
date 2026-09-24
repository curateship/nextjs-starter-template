-- Frame rate belongs to the export.
--
-- The export window offers 30 or 60 frames a second beside the quality
-- choice. Every export used to be made at 30 with no way to change it, so the
-- column defaults to 30, and every row already here keeps what it was made
-- at. New exports always name their rate. A failed export tried again keeps
-- the rate it was asked for, because it is the same row.
ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "frame_rate" integer NOT NULL DEFAULT 30;

ALTER TABLE "video_render_jobs" DROP CONSTRAINT IF EXISTS "video_render_jobs_frame_rate_check";
ALTER TABLE "video_render_jobs" ADD CONSTRAINT "video_render_jobs_frame_rate_check"
  CHECK ("frame_rate" IN (30, 60));
