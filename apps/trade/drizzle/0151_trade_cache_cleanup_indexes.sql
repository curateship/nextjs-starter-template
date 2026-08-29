CREATE INDEX IF NOT EXISTS "trade_candles_open_time_idx"
  ON "trade_candles" ("open_time");

CREATE INDEX IF NOT EXISTS "trade_candle_coverage_from_time_idx"
  ON "trade_candle_coverage" ("from_time");

CREATE INDEX IF NOT EXISTS "trade_candle_gaps_from_time_idx"
  ON "trade_candle_gaps" ("from_time");

CREATE INDEX IF NOT EXISTS "trade_funding_rates_time_idx"
  ON "trade_funding_rates" ("time");

CREATE INDEX IF NOT EXISTS "trade_funding_coverage_from_time_idx"
  ON "trade_funding_coverage" ("from_time");

CREATE INDEX IF NOT EXISTS "trade_funding_gaps_from_time_idx"
  ON "trade_funding_gaps" ("from_time");
