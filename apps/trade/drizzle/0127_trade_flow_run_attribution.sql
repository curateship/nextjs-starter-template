-- Which run placed what, so a flow's dashboard can show its own trades and
-- nobody else's.
--
-- Until now everything a flow did was filed under the wallet only: ladders,
-- orders and fills all say which wallet they belong to and nothing about which
-- flow put them there. That is fine while the only screen is a per-wallet
-- journal, and useless the moment a page has to answer "what has THIS run
-- made" — a trade placed by hand on the same wallet would land in the figures
-- with no way to tell afterwards.
--
-- Nothing here is backfilled. A row written before this migration stays blank
-- and reads as "not this flow's", which is the honest answer: working it out
-- from "trades on this wallet between these two times" would quietly fold
-- somebody's own trade into a flow's profit and there would be no getting it
-- back out.

-- 1. The stamp itself, on the thing the flow actually places.
--
-- Ladder rows are never deleted — they flip to `done` and stay for the record —
-- so this is the copy of "who placed this" that outlives the trade.
ALTER TABLE "trade_smart_ladders"
  ADD COLUMN IF NOT EXISTS "flow_run_id" varchar(36);

CREATE INDEX IF NOT EXISTS "trade_smart_ladders_flow_idx"
  ON "trade_smart_ladders" ("user_id", "flow_run_id");

-- 2. Every order a run has sent, kept by its id.
--
-- **Because the plan forgets.** A rung's order id is written onto the ladder's
-- plan while the order is resting and cleared the moment it fills, and a real
-- fill arrives from the exchange carrying an order id and nothing else. So the
-- link between the two has to be written down somewhere that is not the plan.
-- This is the same lesson `trade_live_triggers` exists for, and it is why a
-- stop that fired at three in the morning can still be traced to the flow that
-- set it up.
--
-- Practice orders go in here too. Their ids are ours rather than an exchange's,
-- but the question being answered is identical and one answer is better than
-- two.
CREATE TABLE IF NOT EXISTS "trade_flow_run_orders" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "order_id" varchar(40) NOT NULL,
  "flow_run_id" varchar(36) NOT NULL,
  -- The ladder or signal trade it came from, for reading the record back.
  "ladder_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_flow_run_orders_pkey"
    PRIMARY KEY ("user_id", "wallet_id", "order_id")
);

ALTER TABLE "trade_flow_run_orders"
  ADD CONSTRAINT "trade_flow_run_orders_wallet_fk"
  FOREIGN KEY ("user_id", "wallet_id")
  REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE;

-- What the dashboard asks: every order this run has sent.
CREATE INDEX IF NOT EXISTS "trade_flow_run_orders_run_idx"
  ON "trade_flow_run_orders" ("user_id", "flow_run_id");
