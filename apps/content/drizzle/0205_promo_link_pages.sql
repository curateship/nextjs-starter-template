-- A link post's outbound address, and what the page it links to says, so a
-- post with no words of its own still has something to write a comment about.
--
-- link_url is empty for a post with words of its own, a picture, a video, and
-- a link back into Reddit. link_page is the linked page's title and opening
-- paragraph, null until read. link_read_at is null until the reader has tried,
-- which is how "not read yet" stays apart from "could not be read".
-- link_error says why a read failed, including an address that pointed inside
-- the network and was refused.
--
-- Additions only.
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "link_url" varchar(2000) NOT NULL DEFAULT '';
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "link_page" jsonb;
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "link_read_at" timestamptz;
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "link_error" text NOT NULL DEFAULT '';
