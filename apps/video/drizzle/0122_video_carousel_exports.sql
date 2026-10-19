-- Carousels kept on the Exports page (task polish/01, part 11).
--
-- Exporting a carousel used to zip its slides in the browser and download the
-- ZIP, keeping nothing. Now the server builds the ZIP, keeps it in storage and
-- writes a row here, so a carousel export is listed, downloaded again, shared
-- by link and cleared out exactly like a video export.
--
-- It is a row in `video_render_jobs` rather than a table of its own. The
-- Exports page's list and search, the clear-out, deleting exports and share
-- links all read this one table today, and `video_export_shares.export_id`
-- points at it. A second table would have meant joining two lists for every
-- page of the gallery and a second kind of share link. A kind column keeps
-- each of those to the one query it already is.
--
-- What changes on the table:
--
--   `kind` is 'video' for every row that exists and 'carousel' for the new
--   ones. A carousel export is written as 'ready' in one step and never
--   queued, so the render worker never sees it.
--   `project_id` may now be empty, and only for a carousel. The check below
--   keeps every video export tied to its project.
--   `carousel_id` names the carousel it came from. Deleting that carousel
--   blanks it (ON DELETE SET NULL) and the export stays, file and share link
--   and all.
--   `caption` is the caption as exported, the words in the ZIP's caption.txt,
--   which the share page shows under the slides.
--   `slide_ranges` lists where each slide's PNG sits inside the ZIP, so the
--   share page reads one slide from storage without fetching the whole file.
--   The aspect check gains '4:5', the feed-post shape only carousels use.
--
-- Nothing is backfilled: every row here is a video export already.
ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'video';
ALTER TABLE "video_render_jobs" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "carousel_id" varchar(36)
  REFERENCES "video_carousels"("id") ON DELETE SET NULL;
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "caption" text;
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "slide_ranges" jsonb;

ALTER TABLE "video_render_jobs"
  DROP CONSTRAINT IF EXISTS "video_render_jobs_aspect_check";
ALTER TABLE "video_render_jobs"
  ADD CONSTRAINT "video_render_jobs_aspect_check"
  CHECK ("aspect" in ('16:9', '9:16', '1:1', '4:3', '4:5'));

ALTER TABLE "video_render_jobs"
  DROP CONSTRAINT IF EXISTS "video_render_jobs_kind_check";
ALTER TABLE "video_render_jobs"
  ADD CONSTRAINT "video_render_jobs_kind_check"
  CHECK (
    ("kind" = 'video' AND "project_id" IS NOT NULL)
    OR ("kind" = 'carousel' AND "project_id" IS NULL AND "slide_ranges" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "ix_video_render_jobs_carousel_id"
  ON "video_render_jobs" ("carousel_id")
  WHERE "carousel_id" IS NOT NULL;
