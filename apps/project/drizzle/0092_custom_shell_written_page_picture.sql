-- A page an admin added can have a picture of its own, drawn at the top of the
-- page above its blocks.
--
-- It is a column on the page rather than a block, which was Tyler's call on
-- 6 Oct 2026 after seeing the block version: "we dont need a picture block. We
-- just need to add it to the modal and the page setting." So the picture is
-- part of what a page is, chosen where the page's name and address are chosen,
-- and every page an admin adds has the same slot for one.
--
-- Both columns default to empty, which is a page with no picture. That is what
-- every page written before today has, and no backfill is needed.
ALTER TABLE "written_pages"
  -- A full address inside this app's own media bucket. 2048 is the length
  -- every other stored picture address uses.
  ADD COLUMN IF NOT EXISTS "image" varchar(2048) NOT NULL DEFAULT '',
  -- What a screen reader says in place of the picture. The media library's own
  -- name for the file, copied in when the picture is chosen, so nobody is
  -- asked to type it.
  ADD COLUMN IF NOT EXISTS "image_alt" varchar(160) NOT NULL DEFAULT '';
