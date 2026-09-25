-- Real orders: the key's recorded expiry, the order-number counter, and the
-- journal of everything ever asked of the exchange with real money.

ALTER TABLE "trade_wallets"
  ADD COLUMN IF NOT EXISTS "agent_valid_until" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "trade_wallet_nonces" (
  "address" varchar(42) NOT NULL,
  "network" varchar(10) NOT NULL,
  "last_nonce" bigint NOT NULL,
  CONSTRAINT "trade_wallet_nonces_address_network_pk" PRIMARY KEY ("address", "network")
);

CREATE TABLE IF NOT EXISTS "trade_live_journal" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "action" varchar(16) NOT NULL,
  "side" varchar(4),
  "px" double precision NOT NULL DEFAULT 0,
  "sz" double precision NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "trade_live_journal_user_id_id_pk" PRIMARY KEY ("user_id", "id"),
  CONSTRAINT "trade_live_journal_wallet_fk" FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "trade_live_journal_wallet_idx"
  ON "trade_live_journal" ("user_id", "wallet_id", "created_at");
