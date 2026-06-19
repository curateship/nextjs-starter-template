ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "project_id" varchar(36);
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'upload';

DO $$
BEGIN
  ALTER TABLE "media"
    ADD CONSTRAINT "media_project_id_video_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "video_projects"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_source_check";
ALTER TABLE "media"
  ADD CONSTRAINT "media_source_check"
  CHECK ("source" in ('upload', 'generated', 'template', 'viral'));

UPDATE "media"
SET "source" = 'template'
WHERE "storage_path" LIKE 'templates/%';

UPDATE "media"
SET "source" = 'viral'
FROM "viral_videos"
WHERE "media"."id" = "viral_videos"."media_id"
  OR "media"."storage_path" = "viral_videos"."thumbnail_storage_path";

CREATE INDEX IF NOT EXISTS "ix_media_project_id" ON "media" ("project_id");
CREATE INDEX IF NOT EXISTS "ix_media_source" ON "media" ("source");
CREATE INDEX IF NOT EXISTS "ix_media_project_source_type_created"
  ON "media" ("project_id", "source", "file_type", "created_at");
