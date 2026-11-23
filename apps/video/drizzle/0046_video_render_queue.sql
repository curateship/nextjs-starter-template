-- Exports: the queue, and the finished files it produces.
--
-- One table does both jobs. A row starts as "somebody asked for this export",
-- and the same row ends up holding the file that came out — so the gallery is
-- simply the finished rows, and there is no second place for the two to
-- disagree about whether a render happened.
--
-- Why a table and not a promise in memory: a render takes minutes, and a server
-- that restarts halfway through would otherwise leave nothing behind. A worker
-- claims a row with `for update skip locked`, holds a lease it renews while
-- ffmpeg runs, and anything whose lease has run out is picked up again. That is
-- also what stops two workers rendering the same job twice.

CREATE TABLE IF NOT EXISTS "video_render_jobs" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  -- An export belongs to its project: delete the project and its exports go
  -- with it, rather than leaving files nobody can trace back to anything.
  "project_id" varchar(36) NOT NULL
    REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  -- queued -> running -> ready, or error / cancelled.
  "status" varchar(20) NOT NULL,
  "quality" varchar(10) NOT NULL,
  -- Whether to level the sound. Copied from the settings when the export is
  -- asked for, so changing the setting later cannot rewrite what was made.
  "normalize_loudness" boolean NOT NULL DEFAULT true,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "error_message" text,
  -- What came out, once it is ready.
  "storage_path" text UNIQUE,
  "file_size" bigint,
  "thumbnail_storage_path" text,
  "duration_ms" integer,
  "width" integer,
  "height" integer,
  -- What it is called in the gallery. The title starts as the project's name.
  "title" varchar(200),
  "description" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  CONSTRAINT "video_render_jobs_status_check"
    CHECK ("status" in ('queued', 'running', 'ready', 'error', 'cancelled')),
  CONSTRAINT "video_render_jobs_quality_check"
    CHECK ("quality" in ('high', 'medium', 'low')),
  -- A "ready" row with no file to hand over would be a lie the gallery acts on.
  CONSTRAINT "video_render_jobs_ready_check"
    CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL),
  CONSTRAINT "video_render_jobs_attempts_check" CHECK ("attempts" >= 0)
);

-- One export at a time per project. This is what makes asking twice harmless:
-- the second insert loses the race and reads back the first one's job.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_render_jobs_project_active"
  ON "video_render_jobs" ("project_id")
  WHERE "status" in ('queued', 'running');

-- The claim reads the oldest waiting job; the gallery reads a person's newest.
CREATE INDEX IF NOT EXISTS "ix_video_render_jobs_status_created"
  ON "video_render_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_render_jobs_user_created"
  ON "video_render_jobs" ("user_id", "created_at");
