-- A Pro member's own background images, videos and sound loops.
--
-- The file itself and its record live in the shell's media library (`media`)
-- and its R2 bucket, because that plumbing already exists and rebuilding it
-- would give the app a second place to look for a file. This table is the part
-- the shell knows nothing about: which of those files the pomodoro app owns,
-- what the member meant it for, and how the re-encode is getting on.
--
-- `media_id` is the primary key, so one library file is at most one pomodoro
-- upload, and the cascade means deleting the library row takes the job with it.
CREATE TABLE IF NOT EXISTS "pomodoro_media_uploads" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" varchar(20) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  -- What the member actually sent, kept after the re-encode replaces the file
  -- so the size the upload was refused or accepted at is still on record.
  "original_bytes" bigint NOT NULL,
  "failure_reason" varchar(200),
  "attempts" integer NOT NULL DEFAULT 0,
  -- Set while a worker pass holds the job. A pass that dies leaves this behind,
  -- so a stale claim is retried after the timeout rather than stuck forever.
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_media_uploads_purpose_check"
    CHECK ("purpose" IN ('background', 'sound')),
  CONSTRAINT "pomodoro_media_uploads_kind_check"
    CHECK ("kind" IN ('image', 'audio', 'video')),
  CONSTRAINT "pomodoro_media_uploads_status_check"
    CHECK ("status" IN ('queued', 'processing', 'ready', 'failed')),
  CONSTRAINT "pomodoro_media_uploads_original_bytes_check"
    CHECK ("original_bytes" > 0)
);

-- The picker's read: this person's uploads for one purpose, newest first.
CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_user_purpose_idx"
  ON "pomodoro_media_uploads" ("user_id", "purpose", "created_at");

-- The worker's read: the oldest job still waiting.
CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_status_created_idx"
  ON "pomodoro_media_uploads" ("status", "created_at");
