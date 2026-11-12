-- The site admin's own My dashboard page takes the shell's Cover photo row
-- in place of the Daily card's Sky row (Tyler, 11 Nov 2026: "this is not
-- using standard", then "Shell row exactly"): None, the drawn sky, or one of
-- the page's pictures, kept as tiles, as a team's and a project's page keep
-- theirs (0173). Every site admin starts on the drawn sky they had, and so
-- does a new one; null is None, picked in the row.
ALTER TABLE "project_site_admin_prefs" ADD COLUMN IF NOT EXISTS "cover_url" text DEFAULT 'sky';
ALTER TABLE "project_site_admin_prefs" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The Daily card's sky kinds (Beach, City, Mountains, Forest) and the site
-- admin's own photo per part of the day went with the Sky row. The drawn sky
-- behind an employee's My dashboard stays; it never had a choice.
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "sky";
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "own_sky_morning";
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "own_sky_afternoon";
ALTER TABLE "project_daily_cards" DROP COLUMN IF EXISTS "own_sky_night";
