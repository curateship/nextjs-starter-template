-- The voiceover shelf: every voiceover the studio reads aloud, with the words
-- it said, the voice that said them and the captions that came back with it,
-- so it can be laid into another project without paying to have it read again.
--
-- A row sits beside a file in the media library rather than as new columns on
-- "media", because "media" belongs to the shell and this app may not change
-- it. The owner is the media row's owner, the same as the music shelf.
-- Deleting the file takes the row with it.
--
-- Voiceovers made before this table existed have no row. Their files are
-- untouched and still play wherever they are used; they just do not appear on
-- the shelf, because the words and voice were never kept.
CREATE TABLE IF NOT EXISTS "video_voiceovers" (
  "media_id" varchar(36) PRIMARY KEY REFERENCES "media" ("id") ON DELETE CASCADE,
  "script" text NOT NULL,
  "voice_id" varchar(64) NOT NULL,
  "voice_name" varchar(255) NOT NULL,
  "duration_ms" integer NOT NULL,
  "captions" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);
