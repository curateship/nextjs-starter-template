-- The chosen background scene, stored exactly like selected_sound.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "selected_background" varchar(60);
