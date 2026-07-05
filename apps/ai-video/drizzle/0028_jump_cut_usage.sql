ALTER TABLE "api_usage_events" DROP CONSTRAINT IF EXISTS "api_usage_feature_check";

ALTER TABLE "api_usage_events"
  ADD CONSTRAINT "api_usage_feature_check"
  CHECK ("feature" in ('text_generation', 'caption_generation', 'video_analysis', 'voiceover', 'image_generation', 'ai_video_generation', 'script_generation', 'carousel_generation', 'export_description', 'jump_cut_analysis'));
