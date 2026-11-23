-- A project's and a team's cover keep the pictures they have had, each a tile
-- to pick again in the page's Cover photo row, as the shell's Admin and CRM
-- pages do (shell migration 0109, Project's 0171). The picked cover stays in
-- "banner_url" and "photo_url", which may now also hold "sky" for the drawn
-- sky (Tyler, 9 Nov 2026: "update the app's all 3 panel dashboard to match
-- the improved shell's ui"). A cover already picked is the first tile.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE "project_projects" SET "cover_images" = jsonb_build_array("banner_url")
  WHERE "banner_url" IS NOT NULL AND "banner_url" <> 'sky' AND "cover_images" = '[]'::jsonb;
UPDATE "project_teams" SET "cover_images" = jsonb_build_array("photo_url")
  WHERE "photo_url" IS NOT NULL AND "photo_url" <> 'sky' AND "cover_images" = '[]'::jsonb;
