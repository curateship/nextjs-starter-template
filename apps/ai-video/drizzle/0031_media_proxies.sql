ALTER TABLE "media"
  ADD COLUMN "proxy_status" varchar(20),
  ADD COLUMN "proxy_profile" varchar(20),
  ADD COLUMN "proxy_storage_path" text,
  ADD COLUMN "proxy_file_size" bigint,
  ADD COLUMN "proxy_error" text,
  ADD COLUMN "proxy_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "proxy_lease_token" varchar(36),
  ADD COLUMN "proxy_lease_expires_at" timestamp with time zone,
  ADD COLUMN "proxy_started_at" timestamp with time zone,
  ADD COLUMN "proxy_generated_at" timestamp with time zone;

ALTER TABLE "media"
  ADD CONSTRAINT "media_proxy_status_check"
  CHECK ("proxy_status" IS NULL OR "proxy_status" in ('queued', 'generating', 'ready', 'error')),
  ADD CONSTRAINT "media_proxy_profile_check"
  CHECK (
    ("proxy_status" IS NULL AND "proxy_profile" IS NULL)
    OR ("proxy_status" IS NOT NULL AND "proxy_profile" = 'h264-720p')
  ),
  ADD CONSTRAINT "media_proxy_video_check"
  CHECK ("proxy_status" IS NULL OR "file_type" = 'video'),
  ADD CONSTRAINT "media_proxy_ready_path_check"
  CHECK ("proxy_status" <> 'ready' OR "proxy_storage_path" IS NOT NULL),
  ADD CONSTRAINT "media_proxy_attempts_check"
  CHECK ("proxy_attempts" >= 0),
  ADD CONSTRAINT "media_proxy_storage_path_unique" UNIQUE ("proxy_storage_path");

CREATE INDEX "ix_media_proxy_status_created"
  ON "media" ("proxy_status", "created_at");

UPDATE "media"
SET "proxy_status" = 'queued', "proxy_profile" = 'h264-720p'
WHERE "file_type" = 'video';
