-- Slippage, "aimed vs filled" (Tyler, 10 Nov 2026: "Add a col for slippage on
-- position table and journal"): the price an order was first placed at, kept
-- by its exchange order id, so a fill that reports that order id can be
-- compared with it. A chase re-places an order many times under new ids; each
-- one carries the first price, never its own. Fills from orders placed before
-- this table, or by anything but this app, have no row and show a dash.
CREATE TABLE IF NOT EXISTS "trade_order_aims" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "order_id" varchar(128) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "side" varchar(4) NOT NULL,
  "aimed_px" double precision NOT NULL,
  "placed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_order_aims_pkey"
    PRIMARY KEY ("user_id", "wallet_id", "order_id"),
  CONSTRAINT "trade_order_aims_wallet_fk"
    FOREIGN KEY ("user_id", "wallet_id")
    REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE,
  CONSTRAINT "trade_order_aims_side_check"
    CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "trade_order_aims_px_check"
    CHECK ("aimed_px" > 0)
);

-- The same for a practice fill, written beside it: the order's first price,
-- or the stop's level for a stop. Null on every practice fill before today.
ALTER TABLE "trade_paper_journal" ADD COLUMN IF NOT EXISTS "aimed_px" double precision;
