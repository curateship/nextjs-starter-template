-- The Graphics panel, social stickers and AI on people
-- (workspace/tasks/graphics-and-ai/01-graphics-and-ai-features.md).
--
-- `video_actors.voice_id` is the voice an actor speaks in (part 6,
-- workspace/docs/actors.md): an id from the Voice window's list. Null means
-- none, which every actor made before this has. Deleting one of a person's
-- own voices clears it from their actors.
ALTER TABLE "video_actors" ADD COLUMN IF NOT EXISTS "voice_id" varchar(100);

-- `video_phone_links` sends files to a project from a phone (part 7,
-- workspace/docs/phone-uploads.md). The QR code's link holds a secret whose
-- hash is `token_hash`; it must be opened within 15 minutes, and only once.
-- Opening it gives that phone a sign-in of its own (`session_hash`) for two
-- hours of sending files into this one project. Rows past both times are
-- deleted as new links are made.
CREATE TABLE IF NOT EXISTS "video_phone_links" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "session_hash" varchar(64) UNIQUE,
  "files_received" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "opened_at" timestamp with time zone,
  "session_expires_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "ix_video_phone_links_user" ON "video_phone_links" ("user_id");

-- `video_colour_looks` holds each person's own saved looks (part 2,
-- workspace/docs/colour-looks.md): a film look or none, and the brightness,
-- contrast and saturation sliders, under a name. One name per person; saving
-- the same name again replaces it.
CREATE TABLE IF NOT EXISTS "video_colour_looks" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "look" varchar(30),
  "brightness" double precision NOT NULL DEFAULT 0,
  "contrast" double precision NOT NULL DEFAULT 1,
  "saturation" double precision NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_colour_looks_user_name" ON "video_colour_looks" ("user_id", "name");

-- `video_settings.sync_api_key` is the Sync Labs key that makes lips match a
-- new voice (part 4, workspace/docs/lip-sync.md), scrambled like the other
-- keys on the row. NULL means no key.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "sync_api_key" text;

-- `video_lip_syncs` is one ask of Sync Labs to make a clip's lips match a
-- new voice (part 4, workspace/docs/lip-sync.md): which clip and which
-- sound, Sync's id for the job, how it stands, what it cost, and the finished
-- file once it is in the media library. The two files sent to Sync are kept
-- in storage only until the job ends.
CREATE TABLE IF NOT EXISTS "video_lip_syncs" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "video_id" varchar(36) NOT NULL REFERENCES "video_project_videos"("id") ON DELETE CASCADE,
  "clip_id" varchar(64) NOT NULL,
  "sound_clip_id" varchar(64) NOT NULL,
  "generation_id" varchar(100),
  "status" varchar(10) NOT NULL,
  "duration_ms" integer NOT NULL,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "sent_paths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "video_lip_syncs_status_check" CHECK ("status" in ('working', 'ready', 'failed'))
);
CREATE INDEX IF NOT EXISTS "ix_video_lip_syncs_video_clip" ON "video_lip_syncs" ("video_id", "clip_id");
-- One working job per clip, so two presses at the same moment make one job.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_lip_syncs_working_clip" ON "video_lip_syncs" ("video_id", "clip_id") WHERE "status" = 'working';
