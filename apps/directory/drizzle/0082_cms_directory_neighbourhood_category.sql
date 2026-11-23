-- Which parent category counts as a neighbourhood on this site.
--
-- The children of that one category are drawn as a small label on a listing
-- card and on a related-listing row — "Dovercourt Village" under a restaurant.
-- Every other category a listing is in is left off, because a card carrying
-- six labels tells a visitor nothing.
--
-- Null is the answer for every site that has not chosen one, and a site with
-- no choice draws no labels at all. Deleting the chosen category sets this
-- back to null rather than leaving a pointer to a category that is gone.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "neighbourhood_category_id" varchar(36)
    REFERENCES "categories"("id") ON DELETE SET NULL;
