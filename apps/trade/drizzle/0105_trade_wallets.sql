-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The wallets a person trades from: practice ones with pretend cash, and live
-- Hyperliquid accounts added by address. No balance column on purpose — a
-- paper wallet's worth is derived and a live wallet's worth is the exchange's
-- answer, so a stored copy could only drift. `agent_key_encrypted` holds a
-- live wallet's trading key as AES-GCM ciphertext (`iv.tag.data`), never
-- plain text; it never leaves the server.
CREATE TABLE IF NOT EXISTS "trade_wallets" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "label" varchar(40) NOT NULL,
  "kind" varchar(8) NOT NULL,
  "protocol" varchar(20) NOT NULL,
  "network" varchar(10) NOT NULL,
  "starting_balance" double precision NOT NULL,
  "address" varchar(42),
  "agent_key_encrypted" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id")
);

-- Which wallet the account panel had active — a remembered choice, resolved
-- against the wallets that exist at read time.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "last_wallet_id" varchar(36);
