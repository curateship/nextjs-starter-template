-- The sound player's saved state: which loop, how loud, muted, and whether
-- the completion chime and notification are on.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "selected_sound" varchar(60),
  ADD COLUMN IF NOT EXISTS "sound_volume" integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS "sound_muted" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "completion_alerts" boolean NOT NULL DEFAULT false;
