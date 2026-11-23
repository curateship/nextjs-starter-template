-- A grid sale is matched to its own coins by the level's name, not by its rung.
--
-- A rung is a position in the range, and the range moves. A grid that has
-- followed price down seven times has handed the name "rung 4" to four
-- different levels at four different prices, so matching a sale to the buy
-- that paid for it by rung number picks coins the sale never touched. On
-- MARSCOIN, 3 October 2026, that reported a rung that made $8.60 as a $8.51
-- loss and a Pair Out rescue that lost $21.62 as a $5.01 profit.
--
-- Every column here is nullable. Orders placed before levels had names keep
-- the old rung match, which is all that can be said about coins nobody wrote
-- the level down for.
ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "level_id" varchar(36);

-- A level's sale and the Pair Out rescue sold alongside it are one event. Two
-- orders a second apart at one price are one thing that happened, and the
-- chart and the bell each say it once.
ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "event_id" varchar(36);

-- How the closed level is named out loud: the rung it was when it bought these
-- coins, and the range it was carried out of when the range has left it behind.
-- "Rung 4 of range 2". A level still inside the range has no range number.
ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "closes_rung" integer;

ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "closes_range" integer;

-- Which of the two orders in an event is the rescue. Said rather than worked
-- out: the two look alike, and which paid for the other is the whole sentence.
ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "pair_out" boolean NOT NULL DEFAULT false;
