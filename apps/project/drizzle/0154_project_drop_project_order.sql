-- The Pinned projects card leaves My dashboard (Tyler, 6 Nov 2026: Projects
-- blocks on the site admin's own page replace it), and with it the order the
-- site admin dragged its projects into. Project holds only test data, so the
-- saved order goes with the card.
ALTER TABLE "project_site_admin_prefs" DROP COLUMN IF EXISTS "project_order";
