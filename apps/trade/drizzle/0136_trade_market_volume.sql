ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "minimum_market_volume_usd" double precision NOT NULL DEFAULT 0;
