-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- Smart orders: the DCA ladders the practice engine keeps working on after
-- one right-click placed them.
--
-- The whole ladder lives in one jsonb plan — concrete prices and sizes, never
-- the percentages the window showed, because from placement on every rule
-- reads the prices as they stand. The plan is read only through its validator,
-- so a row written by an older build is ignored rather than half-obeyed.
-- Finished ladders flip to 'done' and stay, for the record.
CREATE TABLE IF NOT EXISTS "trade_smart_ladders" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "status" varchar(8) NOT NULL,
  "plan" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);

-- The engine reads a wallet's live ladders on every settle.
CREATE INDEX IF NOT EXISTS "trade_smart_ladders_wallet_idx"
  ON "trade_smart_ladders" ("user_id", "wallet_id", "status");

-- The DCA window's last-used settings, remembered per person.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "smart_dca" jsonb;
