-- Embeddable listing badges are opt-in per site. Existing sites stay off.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "badges_enabled" boolean DEFAULT false NOT NULL;
