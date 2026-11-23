-- How much of a practice position its take profit sells when it fires.
--
-- Empty means all of it, which is what a target has always done — so every
-- existing row keeps its behaviour. A number smaller than the position sells
-- that much at the target price and leaves the rest running with no target.
ALTER TABLE "trade_paper_positions"
  ADD COLUMN IF NOT EXISTS "tp_sz" double precision;
