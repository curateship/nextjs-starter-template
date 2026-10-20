-- Forget passed photos (part 8 of "features/02-swiping-and-scoring"): when a
-- pass's photos were deleted, 30 days after it.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "photos_forgotten_at" timestamptz;
