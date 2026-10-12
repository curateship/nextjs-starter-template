-- The words the Voice window's script check flags, set on Settings → Scripts.
--
-- One list for the whole install, on the single video_settings row, as a JSON
-- list of words and phrases. NULL means nobody has saved a list yet, and the
-- check then uses the four starter words (delve, crucial, game-changer,
-- unlock). An empty list means every word was taken off on purpose.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "script_banned_words" jsonb;
