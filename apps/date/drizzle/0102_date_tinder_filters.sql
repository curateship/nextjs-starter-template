-- Match Tinder's own filters (part 4 of "features/02-swiping-and-scoring"):
-- Tinder's distance and ages need setting from Date's. Every phone owes it
-- once, so Tinder hears Date's 25 km and age range the first time.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_phones"
  ADD COLUMN IF NOT EXISTS "discovery_owed" boolean NOT NULL DEFAULT true;
