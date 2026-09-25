-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
CREATE TABLE IF NOT EXISTS "trade_prefs" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "last_market_key" varchar(120),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
