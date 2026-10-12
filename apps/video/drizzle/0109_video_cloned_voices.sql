-- Voices people make from their own sample: upload or record 10 to 60 seconds
-- of speech in the Voices panel and ElevenLabs makes an instant clone.
--
-- The voice lives at ElevenLabs under "voice_id". This row says whose it is,
-- so only its owner sees it in a voice list or can read with it, even though
-- every voice on the app's one ElevenLabs key is visible to the key.
--
-- "sample_media_id" is the recording in the media library. Deleting that file
-- blanks the column rather than the row, because the voice at ElevenLabs keeps
-- working without it. Deleting the account deletes the row; the voice at
-- ElevenLabs is only deleted from the Voices panel.
CREATE TABLE IF NOT EXISTS "video_cloned_voices" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "voice_id" varchar(64) NOT NULL UNIQUE,
  "name" varchar(100) NOT NULL,
  "sample_media_id" varchar(36) REFERENCES "media" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_cloned_voices_user_id"
  ON "video_cloned_voices" ("user_id");
