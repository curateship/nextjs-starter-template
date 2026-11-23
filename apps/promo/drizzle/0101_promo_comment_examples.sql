-- The comments that really went out become the examples the AI copies the
-- voice from. A person can mark one as not a good example without deleting the
-- record of it, so a weak comment stops teaching the AI to write weakly.
--
-- Additions only.
ALTER TABLE "promo_comments"
  ADD COLUMN IF NOT EXISTS "not_example" boolean NOT NULL DEFAULT false;
