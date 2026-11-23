-- The creator research dashboard: the creators you follow, the folders you
-- sort them into, every video they post, and the ones you had Gemini break
-- down.
--
-- Four tables, because the two halves have different lifetimes. A creator post
-- is cheap metadata the watch timer writes in bulk and can throw away; a saved
-- video is an expensive artifact with a downloaded file, a background job and
-- a status to keep. Merging them would mean nullable job columns on every row
-- the timer writes.
--
-- Nothing stores "is this saved". The feed joins `video_viral_videos` on owner,
-- platform and video id, so a video saved from the Viral page shows as saved on
-- the dashboard too, with no bookkeeping to get out of step.

-- One creator per platform per person, matched on the lowercased handle so
-- @Alice and @alice are the same person. YouTube needs its own channel id to
-- list uploads; the other two are read by handle, so it is NULL there.
CREATE TABLE IF NOT EXISTS "video_creators" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "handle" varchar(100) NOT NULL,
  "platform_channel_id" varchar(100),
  "display_name" text,
  "follower_count" bigint,
  "avatar_storage_path" text,
  "profile_url" text NOT NULL,
  "watch" boolean NOT NULL DEFAULT true,
  "last_checked_at" timestamp with time zone,
  "source" varchar(20),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_creators_owner_platform_handle"
  ON "video_creators" ("owner_id", "platform", lower("handle"));
-- The watch tick asks for the creators due a check, oldest first.
CREATE INDEX IF NOT EXISTS "ix_video_creators_watch"
  ON "video_creators" ("watch", "last_checked_at");

-- Folders, copied from the trade app's social folders because the behaviour is
-- the same: unique name per person ignoring case, dragged into an order, and
-- hideable without losing the creators inside.
CREATE TABLE IF NOT EXISTS "video_creator_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "hidden" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_creator_folders_owner_name"
  ON "video_creator_folders" ("owner_id", lower("name"));
CREATE INDEX IF NOT EXISTS "ix_video_creator_folders_owner_position"
  ON "video_creator_folders" ("owner_id", "position");

-- A join table, not a folder column on the creator: one creator can sit in
-- several folders at once.
CREATE TABLE IF NOT EXISTS "video_creator_folder_creators" (
  "folder_id" varchar(36) NOT NULL REFERENCES "video_creator_folders"("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL REFERENCES "video_creators"("id") ON DELETE CASCADE,
  PRIMARY KEY ("folder_id", "creator_id")
);

CREATE INDEX IF NOT EXISTS "ix_video_creator_folder_creators_creator"
  ON "video_creator_folder_creators" ("creator_id");

-- Every video a followed creator posted, as the watch timer found it. Metadata
-- only: no file is downloaded to write one of these, which is what keeps the
-- timer cheap enough to run unattended. Deleting a creator deletes its posts.
--
-- `first_seen_at` carries the ordering when a platform does not say when
-- something was posted, so a post without a date never falls off the end.
CREATE TABLE IF NOT EXISTS "video_creator_posts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL REFERENCES "video_creators"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "url" text NOT NULL,
  "title" text,
  "thumbnail_url" text,
  "duration_seconds" integer,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "first_seen_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_creator_posts_owner_video"
  ON "video_creator_posts" ("owner_id", "platform", "platform_video_id");
CREATE INDEX IF NOT EXISTS "ix_video_creator_posts_feed"
  ON "video_creator_posts" ("owner_id", "posted_at");
CREATE INDEX IF NOT EXISTS "ix_video_creator_posts_creator"
  ON "video_creator_posts" ("creator_id", "posted_at");

-- A video somebody pressed Save & break down on. The status IS the job: a
-- worker claims a waiting row with a lease, downloads it, then has Gemini watch
-- it. A restart puts an interrupted row back to waiting, so closing the browser
-- never strands a half-done job.
--
-- There is deliberately no creator_id. A saved video belongs to the person who
-- saved it, not to whoever they were following at the time, so deleting a
-- creator leaves it standing. The channel is kept as plain text instead.
CREATE TABLE IF NOT EXISTS "video_viral_videos" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "platform_video_id" varchar(100) NOT NULL,
  "source_url" text NOT NULL,
  "status" varchar(20) NOT NULL,
  "error" text,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "thumbnail_storage_path" text,
  "title" text,
  "channel_name" text,
  "duration_seconds" integer,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamp with time zone,
  "breakdown" jsonb,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_video_viral_videos_status" CHECK (
    "status" IN ('waiting', 'downloading', 'analysing', 'ready', 'failed')
  )
);

-- Pressing the button twice is one row, and this is the key the feed joins on.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_viral_videos_owner_video"
  ON "video_viral_videos" ("owner_id", "platform", "platform_video_id");
-- The worker asks for the oldest row in a working state.
CREATE INDEX IF NOT EXISTS "ix_video_viral_videos_status"
  ON "video_viral_videos" ("status", "updated_at");
