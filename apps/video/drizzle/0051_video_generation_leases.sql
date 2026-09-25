-- Existing asset-factory databases gain the same worker lease stored in the
-- baseline migration. A lease prevents two app processes from finishing and
-- charging the same durable Google video job.

ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "lease_token" varchar(36),
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_ai_generations_lease_check'
  ) THEN
    ALTER TABLE "video_ai_generations"
      ADD CONSTRAINT "video_ai_generations_lease_check"
      CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_processing_lease"
  ON "video_ai_generations" ("status", "lease_expires_at");
