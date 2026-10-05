-- The bell draws a notice in pieces now: a short heading, then one fact per
-- line under it ("@ 0.04932", "Main wallet", "filled"), and a tile whose colour
-- and tab come from what kind of thing happened.
--
-- Saved beside the sentences rather than instead of them. Every notice still
-- carries its `message` and `detail` on the notification row itself, which is
-- what the admin table and the home activity card read. These columns are the
-- same event arranged for a list, so a column of twenty rows can be read
-- straight down with the price always in the same place.
--
-- Null on every notice written before this, and such a notice falls back to the
-- sentences it has always had.
ALTER TABLE "trade_notice_links"
  ADD COLUMN IF NOT EXISTS "headline" text;

ALTER TABLE "trade_notice_links"
  ADD COLUMN IF NOT EXISTS "meta" jsonb;

ALTER TABLE "trade_notice_links"
  ADD COLUMN IF NOT EXISTS "kind" varchar(12);
