-- Shape belongs to the export, not only to the project.
--
-- One press of Export can ask for the same project as a tall reel, a square
-- post and a wide video, so every export row says which shape it is made in.
-- The renderer reads the frame size from this column rather than from the
-- project.
--
-- Rows made before this existed are filled in so they keep their meaning:
--   * A finished export's own width and height say what shape it came out as,
--     which is right even if the project's shape was changed afterwards. The
--     sizes are rounded to even numbers at the smaller qualities, so the shape
--     is matched to the nearest of the four rather than compared exactly.
--   * Anything else (waiting, rendering, failed, stopped) would have been made
--     in the project's shape, so it takes the project's shape.
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "aspect" varchar(8);

UPDATE "video_render_jobs" SET "aspect" = CASE
    WHEN "width"::numeric / "height" > 1.55 THEN '16:9'
    WHEN "width"::numeric / "height" > 1.17 THEN '4:3'
    WHEN "width"::numeric / "height" > 0.78 THEN '1:1'
    ELSE '9:16'
  END
WHERE "aspect" IS NULL AND "width" > 0 AND "height" > 0;

UPDATE "video_render_jobs" AS "job" SET "aspect" = "project"."aspect"
FROM "video_projects" AS "project"
WHERE "project"."id" = "job"."project_id" AND "job"."aspect" IS NULL;

ALTER TABLE "video_render_jobs" ALTER COLUMN "aspect" SET NOT NULL;

ALTER TABLE "video_render_jobs" DROP CONSTRAINT IF EXISTS "video_render_jobs_aspect_check";
ALTER TABLE "video_render_jobs" ADD CONSTRAINT "video_render_jobs_aspect_check"
  CHECK ("aspect" IN ('16:9', '9:16', '1:1', '4:3'));

-- One export at a time per project and shape, instead of per project, so three
-- shapes of one project can wait and render side by side while a second tall
-- one of the same project is still refused.
DROP INDEX IF EXISTS "ux_video_render_jobs_project_active";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_render_jobs_project_aspect_active"
  ON "video_render_jobs" ("project_id", "aspect")
  WHERE "status" IN ('queued', 'running');
