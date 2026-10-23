-- A listing can be marked permanently closed.
--
-- Closed is a third state beside draft and published. The listing keeps its
-- page, which says the place has closed, and leaves every list on the site.
-- Every value the column could hold before is still allowed.

ALTER TABLE "directory_listings"
  DROP CONSTRAINT IF EXISTS "directory_listings_status_check";

ALTER TABLE "directory_listings"
  ADD CONSTRAINT "directory_listings_status_check"
    CHECK ("status" IN ('draft', 'published', 'closed'));
