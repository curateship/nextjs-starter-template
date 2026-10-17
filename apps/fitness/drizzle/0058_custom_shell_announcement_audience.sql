-- Existing announcements stay inside the signed-in app. An admin has to
-- deliberately widen one before it can be read from a public page.
ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "audience" varchar(20) NOT NULL DEFAULT 'app';

ALTER TABLE "announcements"
  DROP CONSTRAINT IF EXISTS "announcements_audience_check";

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_audience_check"
  CHECK ("audience" IN ('app', 'everyone'));
