-- The YouTube Data API key for the Viral page's keyword search.
--
-- One key for the whole install, kept on the single video_settings row and
-- scrambled with the same encryption the shell uses for AI keys. NULL means
-- no key is saved, and the app then falls back to the VIDEO_YOUTUBE_API_KEY
-- env var.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "youtube_api_key" text;
