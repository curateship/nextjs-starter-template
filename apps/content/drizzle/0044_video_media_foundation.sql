-- The video app's media foundation, layered onto the shell's media library.
--
-- This is the first migration this app adds on top of the shell's 0000–0043.
-- The shell's `media` table stays exactly as it is; everything here is a side
-- table pointing at it by id, so a future shell merge has nothing to argue
-- with. Nothing existing changes: all four tables start empty, and an install
-- that never uploads a video behaves exactly as it did.
--
-- Two of the tables are background work queues. A row in `video_media_proxies`
-- or `video_media_filmstrips` is the queue entry itself: `queued` rows are
-- waiting, a `generating` row is claimed under a lease that expires, and a
-- worker that dies mid-job leaves a lease to reclaim rather than a stuck row.
-- The lease token doubles as the stored filename, which is what makes "the
-- guarded finish matched no rows, delete what we just uploaded" safe.

-- One smooth-playback copy per library video: 720p H.264 with a keyframe every
-- second, so the editor scrubs the copy instead of fighting the original.
CREATE TABLE IF NOT EXISTS "video_media_proxies" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  -- queued -> generating -> ready, or error once the attempts are spent.
  "status" varchar(20) NOT NULL,
  -- Names the recipe that built the copy, so a future better recipe can tell
  -- old copies from new ones. Only one recipe exists today.
  "profile" varchar(40) NOT NULL,
  "storage_path" text UNIQUE,
  "file_size" bigint,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_media_proxies_status_check"
    CHECK ("status" in ('queued', 'generating', 'ready', 'error')),
  CONSTRAINT "video_media_proxies_profile_check"
    CHECK ("profile" = 'h264-720p'),
  -- A "ready" row with no file to serve would be a lie the routes act on.
  CONSTRAINT "video_media_proxies_ready_check"
    CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL),
  CONSTRAINT "video_media_proxies_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_proxies_status_created"
  ON "video_media_proxies" ("status", "created_at");

-- One tiled sprite of frames per video — about one frame every two seconds,
-- at most 120 — that the timeline slices into clip thumbnails with CSS. The
-- five geometry columns describe the grid; a consumer that guessed at the
-- grid would draw garbage, so a strip is not "ready" until all five exist.
CREATE TABLE IF NOT EXISTS "video_media_filmstrips" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "profile" varchar(40) NOT NULL,
  "storage_path" text UNIQUE,
  "frame_count" integer,
  "frame_width" integer,
  "frame_height" integer,
  "columns" integer,
  "duration_ms" integer,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_media_filmstrips_status_check"
    CHECK ("status" in ('queued', 'generating', 'ready', 'error')),
  CONSTRAINT "video_media_filmstrips_profile_check"
    CHECK ("profile" = 'jpeg-160h-v1'),
  CONSTRAINT "video_media_filmstrips_ready_check"
    CHECK ("status" <> 'ready' OR ("storage_path" IS NOT NULL
      AND "frame_count" > 0 AND "frame_width" > 0 AND "frame_height" > 0
      AND "columns" > 0 AND "duration_ms" > 0)),
  CONSTRAINT "video_media_filmstrips_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX IF NOT EXISTS "ix_video_media_filmstrips_status_created"
  ON "video_media_filmstrips" ("status", "created_at");

-- Named groups for the media library ("B-roll", "Hooks"), owned per person.
-- The unique index is on the lowercased name so "b-roll" cannot sit beside
-- "B-Roll"; the server collapses whitespace before saving for the same reason.
CREATE TABLE IF NOT EXISTS "video_media_collections" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_media_collections_user_id"
  ON "video_media_collections" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_media_collections_user_name"
  ON "video_media_collections" ("user_id", lower("name"));

-- Membership. Deleting a collection detaches its media, never destroys it,
-- and deleting media takes its memberships along — both by cascade.
CREATE TABLE IF NOT EXISTS "video_media_collection_items" (
  "collection_id" varchar(36) NOT NULL
    REFERENCES "video_media_collections" ("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("collection_id", "media_id")
);

CREATE INDEX IF NOT EXISTS "ix_video_media_collection_items_media_id"
  ON "video_media_collection_items" ("media_id");
