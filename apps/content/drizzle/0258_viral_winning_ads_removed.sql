-- Winning ads is gone (Tyler, 27 Nov 2026: "Remove winning ads feature").
-- Content holds no real data yet, so its tables and the Meta token on
-- Settings → Meta go with it: viral_ads and viral_ad_runs (0249),
-- viral_ad_copies (0255) and viral_settings.meta_token (0249).
DROP TABLE IF EXISTS "viral_ad_copies";
DROP TABLE IF EXISTS "viral_ad_runs";
DROP TABLE IF EXISTS "viral_ads";
ALTER TABLE "viral_settings" DROP COLUMN IF EXISTS "meta_token";
