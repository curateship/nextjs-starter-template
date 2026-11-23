-- A grid level is called by the rung it was born at plus which one it is:
-- "Rung 6 - level 4".
--
-- A rung is a seat, not a name. Rung 1 is the top seat and rung 6 the bottom,
-- and every downward move carries the top level out and shuffles everything
-- below into a lower-numbered seat. So one level sits at several rungs over its
-- life. On PONS, 3 October 2026, one level bought at 08:13 as rung 6 and again
-- at 15:06 as rung 5, at the same price, and nothing said the two arrows were
-- the same level.
--
-- This replaces the rung-and-range pair added in 0196 a few hours earlier,
-- which named a carried level "rung 4 of range 2" and could say nothing at all
-- about a level that was never carried.
ALTER TABLE "trade_grid_order_rungs"
  ADD COLUMN IF NOT EXISTS "level_name" varchar(40);

ALTER TABLE "trade_grid_order_rungs"
  DROP COLUMN IF EXISTS "closes_rung";

ALTER TABLE "trade_grid_order_rungs"
  DROP COLUMN IF EXISTS "closes_range";
