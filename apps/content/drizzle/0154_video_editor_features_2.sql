-- Video editor features 2 (workspace/tasks/editor-2/01-editor-features-2.md).
-- Additions only.

-- The markers in an export's file, for its Chapters card
-- (workspace/docs/youtube-chapters.md). NULL on exports made before.
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "markers" jsonb;

-- A steadied copy of a video, made by the media worker when a clip's Steady
-- switch is on (workspace/docs/steady-shaky-footage.md). One per file, so
-- every clip of it shares the copy however it is trimmed.
CREATE TABLE IF NOT EXISTS "video_media_steady_copies" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL CHECK ("status" IN ('queued', 'generating', 'ready', 'error')),
  "storage_path" text,
  "file_size" bigint,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_steady_copies_status_created"
  ON "video_media_steady_copies" ("status", "created_at");

-- A project's intro and outro, added before and after every export of its
-- videos (workspace/docs/intro-and-outro.md). Deleting the file takes it off.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "intro_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "outro_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL;

-- The Export window's switch to leave them off one export. True on every
-- export made before, which had no intro or outro to add anyway.
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "with_intro_outro" boolean NOT NULL DEFAULT true;

-- A copy of the voice in one recording, made the first time a word in it is
-- fixed (workspace/docs/fix-a-word.md), so a second fix doesn't make it again.
-- The voice lives at ElevenLabs under voice_id and is deleted there when the
-- file is deleted from the editor.
CREATE TABLE IF NOT EXISTS "video_media_voice_copies" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "voice_id" varchar(64) NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL
);
