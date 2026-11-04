-- Ask for a video from Promo (workspace/tasks/promo/01-send-to-promo-and-archive.md,
-- part 42): the brief a requested video was asked for with. Additions only.
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "promo_brief" text;
