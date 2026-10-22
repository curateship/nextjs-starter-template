-- Profile suggestions on the phone (part 1 of "features/03-your-profile"):
-- the phone applies one suggestion at a time after Apply, and Undo puts back
-- what the last Apply replaced.
--
-- The AI's review now remembers the photos it numbered, so its photo order
-- still means the same photos after the phone has moved them. Reviews made
-- before this numbered the photos as they stand now, which is what they get.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_own_profile"
  ADD COLUMN IF NOT EXISTS "before" jsonb,
  ADD COLUMN IF NOT EXISTS "applied_at" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "date_own_profile"
SET "review" = jsonb_set("review", '{photoIds}', "photo_ids")
WHERE "review" IS NOT NULL AND NOT ("review" ? 'photoIds');
