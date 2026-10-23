-- The caption look and the platform safe boxes, saved once for the app on
-- Settings → Captions (workspace/tasks/ai-generation/10-caption-presets-fonts-and-safe-box.md;
-- workspace/docs/caption-look.md, workspace/docs/safe-box.md).
--
--   caption_look  The look every caption window starts from: font, size,
--                 colours, outline, capitals, box, entrance, word by word,
--                 words per caption, height and platform. NULL until somebody
--                 saves one; the standard look applies until then.
--   safe_boxes    How far in from each edge TikTok, Reels and Shorts cover a
--                 1080 by 1920 frame. NULL until somebody edits a number; the
--                 starting numbers in src/lib/video/safe-box.ts apply until then.
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "caption_look" jsonb;
ALTER TABLE "video_settings" ADD COLUMN IF NOT EXISTS "safe_boxes" jsonb;
