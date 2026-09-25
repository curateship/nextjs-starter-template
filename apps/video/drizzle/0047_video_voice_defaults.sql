-- The voice this app reads scripts in, remembered.
--
-- Picking a voice, a quality and a speed every single time is a chore, and the
-- answer is nearly always the same one. It sits beside the brand kit because
-- it is the same kind of thing: one answer for the whole app, decided once by
-- whoever set it up.
--
-- Empty means nothing has been saved yet, and the Voice window simply starts
-- on the first voice the account has.
ALTER TABLE "video_settings"
  ADD COLUMN IF NOT EXISTS "voice_defaults" jsonb NOT NULL DEFAULT '{}'::jsonb;
