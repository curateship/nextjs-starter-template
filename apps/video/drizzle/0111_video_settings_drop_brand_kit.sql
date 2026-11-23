-- The brand kit is gone from the app: its logo, colours, caption look,
-- watermark, end card and "Even out the sound" default. Tyler removed it on
-- 13 Oct 2026 as more than the app needs. Exports now carry no watermark or
-- end card, captions start from the standard look, and the Export window's own
-- switch is the only one for evening out the sound.
--
-- The saved kit goes with its column. A logo file it pointed at stays in the
-- media library.
ALTER TABLE "video_settings" DROP COLUMN IF EXISTS "brand_kit";
