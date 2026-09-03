CREATE TABLE "trade_candle_splits" (
  "market_key" varchar(120) NOT NULL,
  "at" bigint NOT NULL,
  "ratio" double precision NOT NULL,
  "detected_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("market_key", "at"),
  CONSTRAINT "trade_candle_splits_ratio_check" CHECK ("ratio" > 0)
);
