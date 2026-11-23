ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
