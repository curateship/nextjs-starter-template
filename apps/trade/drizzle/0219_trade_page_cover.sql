-- A cover photo per dashboard page (Tyler, 7 Nov 2026: "both panel is missing
-- cover photo"). It lies faintly behind the panel's header and fades into the
-- page, as Project's team and project pages do. Null is no cover.
ALTER TABLE "trade_pages" ADD COLUMN IF NOT EXISTS "cover_url" text;
