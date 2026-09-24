-- Each market's highest leverage as one connected wallet's keys read it.
--
-- Aster's public market list labels its leverage fields "ignore", so the real
-- ceiling needs a signed read with the wallet's own keys. Trade asks once a
-- day per wallet and keeps the answer here, so a restart does not ask again.
-- A deleted wallet takes its row with it.
CREATE TABLE IF NOT EXISTS "trade_leverage_ceilings" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "ceilings" jsonb NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("user_id", "wallet_id"),
  FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);
