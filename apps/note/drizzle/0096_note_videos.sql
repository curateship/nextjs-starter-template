-- Video notes: a person's own saved videos, the folders they sort them into,
-- and which bell notice is about which video.
--
-- Everything is per person. Each table points at the person who owns it and
-- goes with them when the account is deleted.

-- A flat list of folders. The unique index is on the lowercased name, so
-- "pricing" cannot sit beside "Pricing"; the server collapses extra spaces
-- before saving for the same reason. `position` is the order down the left
-- panel, which the person drags.
CREATE TABLE IF NOT EXISTS "note_folders" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_folders_owner_name"
  ON "note_folders" ("owner_id", lower("name"));

-- One saved video or sound file. The status is the job: the background worker
-- claims a row by its status and a lease, and every write it makes checks the
-- lease is still its own.
--
-- A video is in one folder at most, so the folder is a column here. Deleting
-- the folder leaves the video on the list, in no folder.
CREATE TABLE IF NOT EXISTS "note_videos" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "folder_id" varchar(36) REFERENCES "note_folders" ("id") ON DELETE SET NULL,
  -- youtube, tiktok, instagram, upload, or yt-dlp's extractor name, lowercased.
  "source" varchar(60) NOT NULL,
  "source_url" text,
  "platform_video_id" varchar(200),
  "kind" varchar(10) NOT NULL DEFAULT 'video',
  "status" varchar(20) NOT NULL,
  "error" text,
  "media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "cover_storage_path" text,
  "title" text,
  "channel_name" text,
  "duration_seconds" integer,
  "posted_at" timestamptz,
  "language" varchar(20),
  -- [{ startMs, endMs, text }] in the language spoken.
  "transcript" jsonb,
  -- The same words joined, so the search box can read them.
  "transcript_text" text,
  -- [string], in English.
  "summary" jsonb,
  -- [{ text, done }]. The ticks are the person's own and are saved here.
  "action_plan" jsonb,
  -- [{ text, startMs }].
  "quotes" jsonb,
  -- [string], lowercase.
  "tags" jsonb,
  "note" text,
  "analysed_at" timestamptz,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ck_note_videos_status" CHECK (
    "status" IN ('waiting', 'downloading', 'saved', 'queued', 'transcribing', 'summarising', 'ready', 'failed')
  ),
  CONSTRAINT "ck_note_videos_kind" CHECK ("kind" IN ('video', 'audio'))
);

-- Saving the same video twice is one row. A link from anywhere else gets its
-- id from yt-dlp after the download, which is why the id can be empty until
-- then and the index leaves those rows out.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_videos_owner_source_video"
  ON "note_videos" ("owner_id", "source", "platform_video_id")
  WHERE "platform_video_id" IS NOT NULL;

-- One stored file belongs to one video, so deleting a video can delete its
-- file without breaking another row that pointed at the same one.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_note_videos_media"
  ON "note_videos" ("media_id")
  WHERE "media_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_note_videos_status"
  ON "note_videos" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_note_videos_owner_created"
  ON "note_videos" ("owner_id", "created_at");

-- Which video a bell notice is about, so clicking the notice opens that video.
-- An app's notice carries only its words, so the link is kept beside it, the
-- way Project and Promo keep theirs. Deleting either side takes the link.
CREATE TABLE IF NOT EXISTS "note_notice_links" (
  "notice_id" varchar(36) PRIMARY KEY REFERENCES "notifications" ("id") ON DELETE CASCADE,
  "video_id" varchar(36) NOT NULL REFERENCES "note_videos" ("id") ON DELETE CASCADE
);
