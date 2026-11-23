-- Report scams to Facebook (part 20 of "facebook/01-facebook-dating"): when
-- the phone reported the match to Facebook as a scam.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_matches"
  ADD COLUMN IF NOT EXISTS "reported_at" timestamptz;
