-- Following and copying a trader, with a fee on copied trades.
--
-- A member can follow a public trader for free, or copy them: every trade the
-- trader makes is placed on one of the copier's own wallets too. Trade adds a
-- fee to each copied real-money trade and owes the trader part of it. Nothing
-- existing is changed except three new columns on trade_public_profiles, each
-- with a default, so every profile starts with copying switched off.

ALTER TABLE "trade_public_profiles"
  ADD COLUMN IF NOT EXISTS "allow_copying" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "copy_blocked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "payout_address" varchar(64);

CREATE TABLE IF NOT EXISTS "trade_follows" (
  "follower_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "trader_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("follower_user_id", "trader_user_id")
);
CREATE INDEX IF NOT EXISTS "trade_follows_trader_idx"
  ON "trade_follows" ("trader_user_id");

-- One row. Tyler, 25 Sep 2026: 0.1% of each copied trade, half to the trader,
-- and real-money copying off until he switches it on.
CREATE TABLE IF NOT EXISTS "trade_copy_config" (
  "id" varchar(16) PRIMARY KEY,
  "fee_rate" double precision NOT NULL,
  "trader_share" double precision NOT NULL,
  "real_money" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
INSERT INTO "trade_copy_config" ("id", "fee_rate", "trader_share", "real_money")
  VALUES ('default', 0.001, 0.5, false)
  ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "trade_copies" (
  "id" varchar(36) PRIMARY KEY,
  "copier_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "copier_wallet_id" varchar(36) NOT NULL,
  "trader_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "trader_wallet_id" varchar(36) NOT NULL,
  "protocol" varchar(20) NOT NULL,
  "dollars_per_trade" double precision NOT NULL,
  "max_open_usd" double precision NOT NULL,
  "max_leverage" double precision NOT NULL,
  "coins" jsonb,
  "price_allowance" double precision NOT NULL,
  "loss_limit_usd" double precision,
  "status" varchar(8) NOT NULL,
  "paused_reason" varchar(32),
  "paused_at" timestamp with time zone,
  "stopped_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  FOREIGN KEY ("copier_user_id", "copier_wallet_id") REFERENCES "trade_wallets" ("user_id", "id") ON DELETE CASCADE,
  CONSTRAINT "trade_copies_status_check" CHECK ("status" IN ('active', 'paused', 'stopped'))
);
CREATE INDEX IF NOT EXISTS "trade_copies_trader_wallet_idx"
  ON "trade_copies" ("trader_wallet_id", "status");
CREATE INDEX IF NOT EXISTS "trade_copies_copier_idx"
  ON "trade_copies" ("copier_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "trade_copies_one_live_idx"
  ON "trade_copies" ("copier_user_id", "trader_user_id")
  WHERE "status" <> 'stopped';

CREATE TABLE IF NOT EXISTS "trade_copy_legs" (
  "copy_id" varchar(36) NOT NULL REFERENCES "trade_copies" ("id") ON DELETE CASCADE,
  "market_key" varchar(120) NOT NULL,
  "trader_sz" double precision NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("copy_id", "market_key")
);

CREATE TABLE IF NOT EXISTS "trade_copy_orders" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "order_id" varchar(128) NOT NULL,
  "copy_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "wallet_id", "order_id"),
  FOREIGN KEY ("user_id", "wallet_id") REFERENCES "trade_wallets" ("user_id", "id") ON DELETE CASCADE
);

-- The fee record. No key to the copy or the wallet on purpose: these rows are
-- money owed to a trader and outlive both.
CREATE TABLE IF NOT EXISTS "trade_copy_fills" (
  "copier_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "fill_id" varchar(128) NOT NULL,
  "copy_id" varchar(36) NOT NULL,
  "trader_user_id" varchar(36) NOT NULL,
  "protocol" varchar(20) NOT NULL,
  "real" boolean NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "notional_usd" double precision NOT NULL,
  "closed_pnl" double precision NOT NULL DEFAULT 0,
  "exchange_fee" double precision NOT NULL DEFAULT 0,
  "fee_usd" double precision NOT NULL DEFAULT 0,
  "trader_share_usd" double precision NOT NULL DEFAULT 0,
  "at" bigint NOT NULL,
  PRIMARY KEY ("copier_user_id", "wallet_id", "fill_id")
);
CREATE INDEX IF NOT EXISTS "trade_copy_fills_trader_idx"
  ON "trade_copy_fills" ("trader_user_id", "at");
CREATE INDEX IF NOT EXISTS "trade_copy_fills_copy_idx"
  ON "trade_copy_fills" ("copy_id");
CREATE INDEX IF NOT EXISTS "trade_copy_fills_market_idx"
  ON "trade_copy_fills" ("market_key", "at");

CREATE TABLE IF NOT EXISTS "trade_copy_notes" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "id" varchar(36) NOT NULL,
  "copy_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "trader_handle" varchar(20) NOT NULL,
  "note" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "wallet_id") REFERENCES "trade_wallets" ("user_id", "id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "trade_copy_notes_wallet_idx"
  ON "trade_copy_notes" ("user_id", "wallet_id", "created_at");

CREATE TABLE IF NOT EXISTS "trade_copy_payouts" (
  "id" varchar(36) PRIMARY KEY,
  "trader_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "amount_usd" double precision NOT NULL,
  "tx_link" text NOT NULL,
  "created_by" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "trade_copy_payouts_trader_idx"
  ON "trade_copy_payouts" ("trader_user_id");

CREATE TABLE IF NOT EXISTS "trade_copy_consents" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "trade_copy_fee_approvals" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "wallet_id" varchar(36) NOT NULL,
  "builder" varchar(42) NOT NULL,
  "fee_rate" double precision NOT NULL,
  "approved_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "wallet_id"),
  FOREIGN KEY ("user_id", "wallet_id") REFERENCES "trade_wallets" ("user_id", "id") ON DELETE CASCADE
);
