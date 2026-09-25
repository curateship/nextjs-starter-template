-- AI asset factories: reusable actors, their opening frames, and durable Veo
-- jobs. Every generated picture or clip is an ordinary row in the shared media
-- library. Removing an organizing row leaves that file available to projects.

CREATE TABLE IF NOT EXISTS "video_actors" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "prompt" text NOT NULL,
  "model" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "image_media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE RESTRICT,
  "reference_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_actors_status_check" CHECK ("status" in ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "ix_video_actors_user_created"
  ON "video_actors" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_actors_image_media_id"
  ON "video_actors" ("image_media_id");
CREATE INDEX IF NOT EXISTS "ix_video_actors_reference_media_id"
  ON "video_actors" ("reference_media_id");

CREATE TABLE IF NOT EXISTS "video_first_frames" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "actor_id" varchar(36) NOT NULL REFERENCES "video_actors" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "prompt" text NOT NULL,
  "model" varchar(100) NOT NULL,
  "aspect_ratio" varchar(8) NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "pinned" boolean NOT NULL DEFAULT false,
  "image_media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE RESTRICT,
  "reference_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_first_frames_aspect_check" CHECK ("aspect_ratio" in ('9:16', '16:9'))
);

CREATE INDEX IF NOT EXISTS "ix_video_first_frames_user_created"
  ON "video_first_frames" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_first_frames_actor_id"
  ON "video_first_frames" ("actor_id");
CREATE INDEX IF NOT EXISTS "ix_video_first_frames_image_media_id"
  ON "video_first_frames" ("image_media_id");
CREATE INDEX IF NOT EXISTS "ix_video_first_frames_reference_media_id"
  ON "video_first_frames" ("reference_media_id");

CREATE TABLE IF NOT EXISTS "video_ai_generations" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "first_frame_id" varchar(36) NOT NULL REFERENCES "video_first_frames" ("id") ON DELETE CASCADE,
  "first_frame_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "prompt" text NOT NULL,
  "model" varchar(100) NOT NULL,
  "aspect_ratio" varchar(8) NOT NULL,
  "duration_seconds" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "operation_name" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "output_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "error_message" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "started_at" timestamptz,
  "updated_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  CONSTRAINT "video_ai_generations_status_check"
    CHECK ("status" in ('queued', 'processing', 'ready', 'error')),
  CONSTRAINT "video_ai_generations_aspect_check"
    CHECK ("aspect_ratio" in ('9:16', '16:9')),
  CONSTRAINT "video_ai_generations_duration_check"
    CHECK ("duration_seconds" in (4, 6, 8)),
  CONSTRAINT "video_ai_generations_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "video_ai_generations_ready_check"
    CHECK ("status" <> 'ready' OR "output_media_id" IS NOT NULL),
  CONSTRAINT "video_ai_generations_lease_check"
    CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_ai_generations_project_active"
  ON "video_ai_generations" ("project_id")
  WHERE "status" in ('queued', 'processing');
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_user_created"
  ON "video_ai_generations" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_first_frame_id"
  ON "video_ai_generations" ("first_frame_id");
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_output_media_id"
  ON "video_ai_generations" ("output_media_id");
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_processing_lease"
  ON "video_ai_generations" ("status", "lease_expires_at");
