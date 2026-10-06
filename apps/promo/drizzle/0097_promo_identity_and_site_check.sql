-- What file 04 adds: which browser build each run used, and the last check of
-- what a website sees through a profile.
--
-- Additions only. The profile's identity reuses `promo_profiles.fingerprint`,
-- which 0094 created and nothing had filled.

-- The image a browser ran on, by Docker's id for it, so a profile's history
-- can say "first run on a new build" beside a profile that began misbehaving.
-- Blank on runs from before this was kept.
ALTER TABLE "promo_browser_sessions"
  ADD COLUMN IF NOT EXISTS "image_id" varchar(80) NOT NULL DEFAULT '';

-- The last "Check what a site sees": what the page saw, the proxy test taken
-- at the same moment, and a verdict line by line. Null until one is run.
ALTER TABLE "promo_profiles"
  ADD COLUMN IF NOT EXISTS "site_check" jsonb;
ALTER TABLE "promo_profiles"
  ADD COLUMN IF NOT EXISTS "site_checked_at" timestamptz;
