-- A project's cover picked as every page's is, with the shell's Cover photo
-- row (Tyler, 12 Nov 2026: "the picture is missing the 3 selection
-- standard"): None, Sky, each picture the project has had, and + to add one.
-- `image_url` keeps the cover in use ("" for none, "sky" for the drawn sky,
-- or a media address), and this keeps the pictures it has had, to pick again.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
