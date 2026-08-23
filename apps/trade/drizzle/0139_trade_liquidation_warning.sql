ALTER TABLE "trade_prefs"
ADD COLUMN "liquidation_warn_usd" double precision,
ADD COLUMN "liquidation_warn_pct" double precision;

CREATE TABLE "trade_liquidation_warnings" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "market_key" varchar(180) NOT NULL,
  "warned_at" timestamp with time zone NOT NULL,
  "cleared_at" timestamp with time zone,
  CONSTRAINT "trade_liquidation_warnings_user_id_wallet_id_market_key_pk"
    PRIMARY KEY ("user_id", "wallet_id", "market_key"),
  CONSTRAINT "trade_liquidation_warnings_wallet_fk"
    FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets" ("user_id", "id") ON DELETE CASCADE
);

CREATE INDEX "ix_trade_liquidation_warnings_user_warned"
ON "trade_liquidation_warnings" ("user_id", "warned_at");
