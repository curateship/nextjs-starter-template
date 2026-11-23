-- A page's own cover pictures (Tyler, 8 Nov 2026: "add that but only use the
-- sky one. I also want to add custom images too"). Each picture added to a
-- page's cover stays as a tile to pick again, up to 8. The cover itself stays
-- in cover_url, which may now also read 'sky' for the drawn sky. Both page
-- tables get the same column; nothing existing changes.

ALTER TABLE "crm_pages" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "admin_pages" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
