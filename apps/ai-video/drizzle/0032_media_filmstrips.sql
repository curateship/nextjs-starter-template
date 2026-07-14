ALTER TABLE "media"
  ADD COLUMN "filmstrip_status" varchar(20),
  ADD COLUMN "filmstrip_profile" varchar(20),
  ADD COLUMN "filmstrip_storage_path" text,
  ADD COLUMN "filmstrip_frame_count" integer,
  ADD COLUMN "filmstrip_frame_width" integer,
  ADD COLUMN "filmstrip_frame_height" integer,
  ADD COLUMN "filmstrip_columns" integer,
  ADD COLUMN "filmstrip_duration_ms" integer,
  ADD COLUMN "filmstrip_error" text,
  ADD COLUMN "filmstrip_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "filmstrip_lease_token" varchar(36),
  ADD COLUMN "filmstrip_lease_expires_at" timestamp with time zone,
  ADD COLUMN "filmstrip_generated_at" timestamp with time zone;

ALTER TABLE "media"
  ADD CONSTRAINT "media_filmstrip_status_check"
  CHECK ("filmstrip_status" IS NULL OR "filmstrip_status" in ('queued', 'generating', 'ready', 'error')),
  ADD CONSTRAINT "media_filmstrip_profile_check"
  CHECK (
    ("filmstrip_status" IS NULL AND "filmstrip_profile" IS NULL)
    OR ("filmstrip_status" IS NOT NULL AND "filmstrip_profile" = 'jpeg-160h-v1')
  ),
  ADD CONSTRAINT "media_filmstrip_video_check"
  CHECK ("filmstrip_status" IS NULL OR "file_type" = 'video'),
  ADD CONSTRAINT "media_filmstrip_ready_check"
  CHECK (
    "filmstrip_status" <> 'ready'
    OR (
      "filmstrip_storage_path" IS NOT NULL
      AND "filmstrip_frame_count" > 0
      AND "filmstrip_frame_width" > 0
      AND "filmstrip_frame_height" > 0
      AND "filmstrip_columns" > 0
      AND "filmstrip_duration_ms" > 0
    )
  ),
  ADD CONSTRAINT "media_filmstrip_attempts_check"
  CHECK ("filmstrip_attempts" >= 0),
  ADD CONSTRAINT "media_filmstrip_storage_path_unique"
  UNIQUE ("filmstrip_storage_path");

CREATE INDEX "ix_media_filmstrip_status_created"
  ON "media" ("filmstrip_status", "created_at");
