ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "render_title" varchar(255),
  ADD COLUMN IF NOT EXISTS "render_caption" text;

UPDATE "video_projects"
SET "render_title" = "name"
WHERE "render_status" = 'ready'
  AND "render_storage_path" IS NOT NULL
  AND "render_title" IS NULL;
