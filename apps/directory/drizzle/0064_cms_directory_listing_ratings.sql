ALTER TABLE "directory_listings"
  ADD COLUMN IF NOT EXISTS "rating" numeric(2, 1);

ALTER TABLE "directory_listings"
  DROP CONSTRAINT IF EXISTS "directory_listings_rating_check",
  ADD CONSTRAINT "directory_listings_rating_check"
  CHECK ("rating" IS NULL OR "rating" BETWEEN 0 AND 5);
