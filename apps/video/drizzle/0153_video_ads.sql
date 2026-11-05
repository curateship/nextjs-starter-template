-- The Ads panel in the editor (workspace/tasks/ads/01-sounds-and-ads.md,
-- workspace/docs/ads.md). Additions only.

-- Each person's ads shelf: sponsor clips (a file) and saved text ads (words
-- and a look). A read the AI made keeps its script and voice, so a language
-- copy can say it again. `loudness` is the file's measured loudness, for
-- matching an ad to the voice of the video it goes in.
CREATE TABLE IF NOT EXISTS "video_ads" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "kind" varchar(10) NOT NULL CHECK ("kind" IN ('clip', 'text')),
  "name" varchar(255) NOT NULL,
  "media_id" varchar(36) REFERENCES "media" ("id") ON DELETE CASCADE,
  "text" varchar(200),
  "look" jsonb,
  "read_script" text,
  "read_voice_id" varchar(64),
  "read_voice_name" varchar(255),
  "created_at" timestamptz NOT NULL,
  CHECK (("kind" = 'clip' AND "media_id" IS NOT NULL) OR ("kind" = 'text' AND "text" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "ix_video_ads_user_id" ON "video_ads" ("user_id");

-- Named looks for text ads.
CREATE TABLE IF NOT EXISTS "video_ad_looks" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "look" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_ad_looks_user_id" ON "video_ad_looks" ("user_id");

-- How loud a file is, measured once with ffmpeg and kept, so placing an ad
-- does not read a long video again each time. NULL lufs means it has no sound.
CREATE TABLE IF NOT EXISTS "video_media_loudness" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "lufs" double precision,
  "measured_at" timestamptz NOT NULL
);

-- How many ads a video gets for its length, and the too-many limit.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "ad_rules" jsonb;

-- Where an export's ads were, for the marks on its viewer curve.
ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "ads" jsonb;
