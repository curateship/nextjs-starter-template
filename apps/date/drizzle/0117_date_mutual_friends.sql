-- Mutual friends and groups on the card (part 11 of
-- "facebook/01-facebook-dating"): how many mutual friends Facebook shows
-- (null when it shows none), their names when it shows them, and the groups
-- you share.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "mutual_friends" integer CHECK ("mutual_friends" IS NULL OR "mutual_friends" >= 0),
  ADD COLUMN IF NOT EXISTS "mutual_names" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "shared_groups" jsonb NOT NULL DEFAULT '[]'::jsonb;
