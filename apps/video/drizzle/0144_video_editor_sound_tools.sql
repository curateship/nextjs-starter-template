-- The editor's sound tools (workspace/tasks/editor/01-editor-features.md,
-- parts 5 to 7; workspace/docs/clean-up-the-voice.md, sound-effects.md and
-- beat-snapping.md). Three tables, each empty until somebody uses the tool,
-- so a workspace that never does behaves exactly as it did.

-- A copy of one file's sound with the hum and hiss taken out at one of three
-- strengths, so the editor's preview plays what the export will. It is a
-- background work queue like `video_media_waveforms`: a `queued` row waits, a
-- `generating` row is claimed under a lease that expires, and a worker that
-- dies mid-job leaves a lease to reclaim rather than a stuck row.
--
-- Rows are made when a clip's "Clean up the voice" is switched on, never by
-- discovery, because most files are never cleaned. One row per file and
-- strength. `id` is the two joined, `<media_id>:<strength>`, so the queue can
-- claim a row by one key the way it claims the other three. Deleting the file
-- removes its rows; the copies in storage stay under `video/clean-sound/`,
-- the same as the smooth copies under `video/proxies/` always have.
CREATE TABLE IF NOT EXISTS "video_media_clean_sounds" (
  "id" varchar(48) PRIMARY KEY,
  "media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE CASCADE,
  -- light, medium or strong, as the clip's setting names them.
  "strength" varchar(10) NOT NULL,
  -- queued -> generating -> ready, or error once the attempts are spent.
  "status" varchar(20) NOT NULL,
  -- The cleaned sound as an M4A, once it is ready.
  "storage_path" text,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_media_clean_sounds_strength_check"
    CHECK ("strength" in ('light', 'medium', 'strong')),
  CONSTRAINT "video_media_clean_sounds_status_check"
    CHECK ("status" in ('queued', 'generating', 'ready', 'error')),
  CONSTRAINT "video_media_clean_sounds_id_check"
    CHECK ("id" = "media_id" || ':' || "strength"),
  CONSTRAINT "video_media_clean_sounds_ready_check"
    CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL),
  CONSTRAINT "video_media_clean_sounds_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_clean_sounds_status_created"
  ON "video_media_clean_sounds" ("status", "created_at");

-- Sound files marked as sound effects, for the editor's Sounds panel. The
-- same kind of mark as `video_music_tracks`: on a file the media library
-- already holds, owned by whoever owns the file, and gone when the file is.
-- The starter pack that ships with Video is files in the app, not rows here.
CREATE TABLE IF NOT EXISTS "video_sound_effects" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL
);

-- Where the beats fall in each file marked as music, found by the background
-- worker so clip edges can snap to them. Another work queue like the one
-- above. Discovery queues a row for every file in `video_music_tracks` that
-- has none.
--
-- `beats` is a JSON list of times in milliseconds from the start of the file,
-- never from a clip or the timeline, so trimming or moving a clip never makes
-- it wrong. An empty list means no steady beat was found. `tempo` is the beats
-- a minute it settled on, kept so the doc's measurements can be checked.
-- Deleting the file removes the row.
CREATE TABLE IF NOT EXISTS "video_media_beats" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "beats" jsonb,
  "tempo" double precision,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_media_beats_status_check"
    CHECK ("status" in ('queued', 'generating', 'ready', 'error')),
  CONSTRAINT "video_media_beats_ready_check"
    CHECK ("status" <> 'ready' OR "beats" IS NOT NULL),
  CONSTRAINT "video_media_beats_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_beats_status_created"
  ON "video_media_beats" ("status", "created_at");
