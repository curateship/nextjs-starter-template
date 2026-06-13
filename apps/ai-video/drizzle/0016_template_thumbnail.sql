-- Templates keep their own copy of the source reel's thumbnail so the card
-- survives deletion of the source reel/creator (which destroys the original).
ALTER TABLE "video_templates" ADD COLUMN IF NOT EXISTS "thumbnail_storage_path" text;
