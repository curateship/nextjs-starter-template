-- The floating timer opens by itself when a focus starts, and each member can
-- switch that off in Settings → Timer (Tyler, 7 Nov 2026). On for everyone
-- until they do.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "floating_timer" boolean DEFAULT true NOT NULL;
