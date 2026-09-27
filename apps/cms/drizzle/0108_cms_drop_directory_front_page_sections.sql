-- The site's home page rows moved onto the shell's front page, which saves them
-- on the site beside its menu and its footer. One builder, one place.
--
-- Run `scripts/move-home-page-rows.mjs` against this database first: it copies
-- every row in this table onto its site's front page. This drops the table, so
-- anything still only here is gone.
DROP TABLE IF EXISTS "directory_front_page_sections";
