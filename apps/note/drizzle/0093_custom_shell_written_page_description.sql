-- A page an admin added can say a line or two about itself.
--
-- Tyler asked on 6 Oct 2026 for a Pages list block: a grid of cards for the
-- pages he picks, each showing "the page title and page description". Pages had
-- a name and a picture but nothing to describe them, so this is that field. It
-- is chosen in the Add a page window and in the editor's Page settings, beside
-- the name and the picture, and it is also what search engines are told about
-- the page.
--
-- Empty by default, which is what every page written before today has: its
-- card shows the name alone, and its search description falls back to the
-- template in Settings > Public > SEO exactly as it did. No backfill needed.
ALTER TABLE "written_pages"
  -- 300 characters: two or three lines on a card, and comfortably past the
  -- length a search engine shows.
  ADD COLUMN IF NOT EXISTS "description" varchar(300) NOT NULL DEFAULT '';
