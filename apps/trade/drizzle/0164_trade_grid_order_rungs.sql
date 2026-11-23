-- The exchange remembers an order id, but it does not know which grid rung
-- sent the order. Keep that link when the engine sends the order so an old
-- chart arrow still names the right rung after the grid range moves.
CREATE TABLE IF NOT EXISTS "trade_grid_order_rungs" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "order_id" varchar(40) NOT NULL,
  "ladder_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "direction" varchar(5) NOT NULL,
  "rung" integer NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_grid_order_rungs_pkey"
    PRIMARY KEY ("user_id", "wallet_id", "order_id"),
  CONSTRAINT "trade_grid_order_rungs_wallet_fk"
    FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE,
  CONSTRAINT "trade_grid_order_rungs_direction_check"
    CHECK ("direction" IN ('long', 'short')),
  CONSTRAINT "trade_grid_order_rungs_rung_check"
    CHECK ("rung" >= 1)
);

CREATE INDEX IF NOT EXISTS "trade_grid_order_rungs_ladder_idx"
  ON "trade_grid_order_rungs" ("user_id", "ladder_id");
