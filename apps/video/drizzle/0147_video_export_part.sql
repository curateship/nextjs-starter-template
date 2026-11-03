-- Exporting part of a project, from a start to an end
-- (workspace/tasks/big-files/01-big-file-features.md, part 22;
-- workspace/docs/big-files.md, "Exporting part of a project").
--
-- Both null is the whole project, which every export before this one was.
-- Milliseconds into the project's timeline, as the Export window was given
-- them. The old release ignores the columns, so it keeps exporting whole
-- projects while the two run side by side.
ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "range_start_ms" integer,
  ADD COLUMN IF NOT EXISTS "range_end_ms" integer;
DO $$ BEGIN
  ALTER TABLE "video_render_jobs" ADD CONSTRAINT "video_render_jobs_range_check"
    CHECK (
      ("range_start_ms" IS NULL AND "range_end_ms" IS NULL)
      OR ("range_start_ms" >= 0 AND "range_end_ms" > "range_start_ms")
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
