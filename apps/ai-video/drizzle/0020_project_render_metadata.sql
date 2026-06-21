ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "render_file_size" bigint,
  ADD COLUMN IF NOT EXISTS "render_thumbnail_storage_path" varchar(500);
