-- Shared sounds and backgrounds (uploads-and-sharing tasks 03, 04 and 05,
-- 10 Oct 2026). A file ticked Share reaches other members: on its owner's
-- public page, under "Shared by members", on a page of its own, and in rooms.
-- See workspace/docs/shared-media.md.

-- When the Share tick last went on, and when the member confirmed the file is
-- theirs or free to share. A file is shared with others only while both the
-- tick and the confirmation are there, it is out of the bin, it is not
-- waiting for an admin's first check, and an admin has not taken it off.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "shared_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "share_confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "share_waiting_since" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "admin_unshared_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "admin_unshare_reason" varchar(300),
  ADD COLUMN IF NOT EXISTS "share_announced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "featured_at" timestamp with time zone;

-- Before this, the Share tick was only saved and nobody confirmed anything.
-- Those ticks go off rather than publishing a file whose owner never said
-- they had the right to share it.
UPDATE "pomodoro_media_uploads"
  SET "shared" = false
  WHERE "shared" = true AND "share_confirmed_at" IS NULL;

-- "Shared by members", newest first, without reading every upload.
CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_shared_idx"
  ON "pomodoro_media_uploads" ("purpose", "shared_at" DESC)
  WHERE "shared" = true AND "deleted_at" IS NULL;

-- One featured file on the front page at a time, decided by the database.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_media_uploads_one_featured"
  ON "pomodoro_media_uploads" ((true))
  WHERE "featured_at" IS NOT NULL;

-- The profile's "My shared sounds and backgrounds" switch, off by default
-- like every other section, and the date an admin approved this member's
-- first share, after which their shares go straight out.
ALTER TABLE "pomodoro_profiles"
  ADD COLUMN IF NOT EXISTS "show_shared_media" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sharing_approved_at" timestamp with time zone;

-- A shared file somebody kept for later with the heart.
CREATE TABLE IF NOT EXISTS "pomodoro_saved_media" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "media_id")
);
CREATE INDEX IF NOT EXISTS "pomodoro_saved_media_media_idx"
  ON "pomodoro_saved_media" ("media_id");

-- The first time each person added someone else's shared file to a room or
-- saved it, for the owner's weekly note. One row per person per file, so
-- adding it twice counts once.
CREATE TABLE IF NOT EXISTS "pomodoro_media_adds" (
  "media_id" varchar(36) NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("media_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "pomodoro_media_adds_created_idx"
  ON "pomodoro_media_adds" ("created_at");

-- The Monday each owner was last sent the weekly note, so a week is told once.
CREATE TABLE IF NOT EXISTS "pomodoro_share_weekly_notes" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "week_start")
);

-- Reports about a shared file go in the same queue. A copyright report from
-- somebody with no account carries their name, email and what the file
-- copies. The file id stays on the report after the file is gone.
ALTER TABLE "room_reports"
  ADD COLUMN IF NOT EXISTS "media_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "contact_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "contact_email" varchar(254),
  ADD COLUMN IF NOT EXISTS "details" varchar(2000);
CREATE INDEX IF NOT EXISTS "room_reports_media_idx"
  ON "room_reports" ("media_id")
  WHERE "media_id" IS NOT NULL;
-- One report per member per file, so a second press files nothing new.
CREATE UNIQUE INDEX IF NOT EXISTS "room_reports_reporter_media_unique"
  ON "room_reports" ("reporter_user_id", "media_id")
  WHERE "media_id" IS NOT NULL AND "reporter_user_id" IS NOT NULL;
