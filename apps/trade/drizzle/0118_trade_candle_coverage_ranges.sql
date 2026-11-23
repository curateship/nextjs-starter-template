-- Coverage used to be one row per market and timeframe. Two separate windows
-- were therefore widened into one span, falsely claiming the untouched middle
-- had already been fetched. Keep each successfully fetched piece separately.
ALTER TABLE "trade_candle_coverage"
  DROP CONSTRAINT "trade_candle_coverage_pkey";

ALTER TABLE "trade_candle_coverage"
  ADD PRIMARY KEY ("market_key", "interval", "from_time");
