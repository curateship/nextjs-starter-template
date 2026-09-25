-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The candle store: months of price history kept locally so a backtest can
-- walk it without asking the exchange for the same week twenty times.
--
-- Shared, with no owner. A candle is a public fact about a market, so two
-- people testing the same coin over the same days read the same rows.
--
-- Safe to run again: every statement is guarded, and a bar is identified by
-- its own open time, so writing the same bar twice changes nothing.
CREATE TABLE IF NOT EXISTS "trade_candles" (
  "market_key" varchar(120) NOT NULL,
  "interval" varchar(8) NOT NULL,
  "open_time" bigint NOT NULL,
  "open" double precision NOT NULL,
  "high" double precision NOT NULL,
  "low" double precision NOT NULL,
  "close" double precision NOT NULL,
  "volume" double precision NOT NULL,
  PRIMARY KEY ("market_key", "interval", "open_time")
);

-- How much history has been **asked for**, which is not the same as how much
-- came back. Asking again for a stretch the exchange has nothing for would
-- fetch nothing, slowly, forever; recording the ask is what makes the second
-- run read straight from the table. What was missing goes in the gaps table.
CREATE TABLE IF NOT EXISTS "trade_candle_coverage" (
  "market_key" varchar(120) NOT NULL,
  "interval" varchar(8) NOT NULL,
  "from_time" bigint NOT NULL,
  "to_time" bigint NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("market_key", "interval")
);

-- A stretch the exchange had no bars for, written down rather than papered
-- over. A coin listed three weeks ago has no price from ninety days ago, and
-- the honest answer is that the question could not be asked.
CREATE TABLE IF NOT EXISTS "trade_candle_gaps" (
  "market_key" varchar(120) NOT NULL,
  "interval" varchar(8) NOT NULL,
  "from_time" bigint NOT NULL,
  "to_time" bigint NOT NULL,
  "reason" text NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("market_key", "interval", "from_time")
);
