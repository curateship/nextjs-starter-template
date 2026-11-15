-- The Trade dashboard's page keeps its own cover pictures, as every shell page
-- does (Tyler, 8 Nov 2026: "cover photos is not using shell standard"). Each
-- picture added to the cover stays as a tile to pick again, up to 8, and the
-- cover itself stays in cover_url, which may also read 'sky' for the drawn
-- sky. The rules are the shell's, `src/lib/notes/page-cover.ts`. An addition
-- only; nothing existing changes.
ALTER TABLE "trade_dashboard_pages" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
