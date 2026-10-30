-- Wan and Seedance video models
-- (workspace/tasks/ai-generation/15-wan-and-seedance.md;
-- workspace/docs/wan-and-seedance.md). Two more companies can make an AI
-- shot beside Google. Their keys live on the Video app's own settings row,
-- never in the shell's ai_provider_keys.
--
-- video_settings
--   wan_api_key        Alibaba Model Studio key, scrambled the same way as
--                      the Pexels key. NULL means no key.
--   seedance_api_key   BytePlus or Volcengine Ark key, scrambled. NULL means
--                      no key.
--   wan_region         Which Alibaba site the key came from: 'intl'
--                      (Singapore) or 'china' (Beijing). A key only works on
--                      its own site.
--   seedance_region    'byteplus' (international) or 'volcengine' (China).
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "wan_api_key" text;
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "seedance_api_key" text;
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "wan_region" varchar(20) NOT NULL DEFAULT 'intl';
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "seedance_region" varchar(20) NOT NULL DEFAULT 'byteplus';

-- video_ai_generations
--   with_sound           Whether the company was asked to make sound. Only
--                        Seedance can be told not to, and is cheaper then.
--                        Every earlier shot was made with sound.
--   end_frame_media_id   The picture the shot lands on, on Wan and Seedance.
--                        Only the last piece of a shot carries it. NULL means
--                        the shot ends wherever it ends.
--   voice_media_id       A voiceover the person in the shot says, on Wan.
--                        NULL means the shot makes its own sound.
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "with_sound" boolean NOT NULL DEFAULT true;
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "end_frame_media_id" varchar(36)
  REFERENCES "media"("id") ON DELETE SET NULL;
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "voice_media_id" varchar(36)
  REFERENCES "media"("id") ON DELETE SET NULL;
