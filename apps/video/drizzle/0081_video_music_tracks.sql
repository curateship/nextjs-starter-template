-- The music shelf: sound files somebody has marked as music, so the studio's
-- Music panel can list them apart from voiceovers and sound effects.
--
-- A row is only a mark on a file that already lives in the media library, so
-- the file's owner is the media row's owner and there is no user column to
-- keep in step with it. Deleting the file takes the mark with it; removing the
-- mark leaves the file alone.
CREATE TABLE IF NOT EXISTS "video_music_tracks" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL
);
