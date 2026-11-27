-- A picture for each project, shown at the top of its dashboard's left column.
-- Tyler sent the new design on 13 Oct 2026. Empty means no picture.
-- The value is a media address picked through the shared image field, so it
-- is always one of the workspace's own uploads.

ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "image_url" varchar(2048) NOT NULL DEFAULT '';
