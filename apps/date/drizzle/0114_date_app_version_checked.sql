-- Check the app after it updates (part 7 of "facebook/01-facebook-dating",
-- and part 1 of "features/04"): the version whose buttons were last found.
-- A phone reporting another version runs a read-only check first. A phone
-- already paired counts its version today as checked, so only a later update
-- starts a check.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_phones"
  ADD COLUMN IF NOT EXISTS "tinder_version_checked" varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "facebook_version_checked" varchar(60) NOT NULL DEFAULT '';

UPDATE "date_phones" SET "tinder_version_checked" = "tinder_version", "facebook_version_checked" = "facebook_version"
WHERE "tinder_version_checked" = '' AND "facebook_version_checked" = '';
