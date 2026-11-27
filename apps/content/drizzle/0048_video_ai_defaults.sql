-- Which AI does what, remembered.
--
-- Every tool used to decide for itself, which meant a choice nobody could see
-- and nobody could change. Now the choice is offered where the work is asked
-- for — and saved the moment it is made, so it is answered once rather than
-- every time.
--
-- One row for the whole app, beside the brand kit and the voice: this is a
-- decision about how the app works, not about one project.
ALTER TABLE "video_settings"
  ADD COLUMN IF NOT EXISTS "ai_defaults" jsonb NOT NULL DEFAULT '{}'::jsonb;
