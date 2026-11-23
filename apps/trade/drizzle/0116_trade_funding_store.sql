-- Historical funding used by backtests. These are public market facts, so one
-- stored copy serves every run that asks for the same market and settlement.
CREATE TABLE IF NOT EXISTS "trade_funding_rates" (
  "market_key" varchar(120) NOT NULL,
  "time" bigint NOT NULL,
  "rate" double precision NOT NULL,
  PRIMARY KEY ("market_key", "time")
);

-- The span already asked for. Missing settlements are kept separately, so a
-- second run neither refetches old history nor mistakes an absence for zero.
CREATE TABLE IF NOT EXISTS "trade_funding_coverage" (
  "market_key" varchar(120) PRIMARY KEY NOT NULL,
  "from_time" bigint NOT NULL,
  "to_time" bigint NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trade_funding_gaps" (
  "market_key" varchar(120) NOT NULL,
  "from_time" bigint NOT NULL,
  "to_time" bigint NOT NULL,
  "reason" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("market_key", "from_time")
);
