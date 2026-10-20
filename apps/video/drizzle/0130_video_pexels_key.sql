-- B-roll from Pexels (task ai-generation/09-b-roll-from-pexels).
--
-- The Pexels API key the B-roll tool searches free stock video with, kept on
-- the app's one settings row beside the YouTube key and scrambled the same
-- way (`encryptSecret`). NULL means no key: the B-roll tool then says it
-- needs one and links to Settings -> Pexels. There is no env var fallback.
ALTER TABLE "video_settings"
  ADD COLUMN IF NOT EXISTS "pexels_api_key" text;
