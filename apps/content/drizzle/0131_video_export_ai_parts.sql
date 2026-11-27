-- Say what AI made (task ai-generation/13-say-what-ai-made).
--
-- Every video export now carries a short list of which parts of it the AI
-- made, for YouTube's "altered or synthetic content" box and TikTok's AI
-- label. The render works it out from the timeline it draws, so the list
-- always belongs to the file.
--
--   ai_parts        The list, as JSON: the script or opening line, the
--                   voice by company, pictures and moving clips by model
--                   with the second each one starts at, and a translation.
--                   An empty list means nothing in the file was made by AI.
--                   Null on every export made before this and on carousel
--                   exports, which have no timeline to walk.
--   ai_hand_edited  Whether the copied paragraph says the script and the
--                   pictures were also edited by hand. On unless the person
--                   ticks it off, and kept per export.
ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "ai_parts" jsonb;

ALTER TABLE "video_render_jobs"
  ADD COLUMN IF NOT EXISTS "ai_hand_edited" boolean DEFAULT true NOT NULL;
