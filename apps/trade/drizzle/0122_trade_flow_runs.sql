-- A flow that has been switched on to trade a wallet.
--
-- One row per switched-on flow. It holds the settings FROZEN at the moment it
-- started: editing the drawing afterwards must not change what is already in
-- the market, the same way a placed ladder freezes its rung prices.
--
-- It does not hold any trading state. The ladders this flow places are ordinary
-- `trade_smart_ladders` rows, worked by the engine that already exists — this
-- row only says "keep looking for coins to place one on".
CREATE TABLE IF NOT EXISTS "trade_flow_runs" (
  "user_id" varchar(36) NOT NULL,
  "wallet_id" varchar(36) NOT NULL,
  "id" varchar(36) NOT NULL,
  "automation_id" varchar(36) NOT NULL,
  "status" varchar(8) NOT NULL,
  "spec" jsonb NOT NULL,
  -- The coins this flow has actually placed a ladder on.
  --
  -- Not the same as its coin list. Stopping cancels what this flow put in the
  -- market and nothing else: a ladder somebody placed by hand on one of these
  -- coins is theirs, and cancelling it because a flow was switched off would
  -- be taking away an order they never gave this flow.
  "placed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stopped_at" timestamp with time zone,
  "stopped_reason" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_flow_runs_pkey" PRIMARY KEY ("user_id", "id")
);

ALTER TABLE "trade_flow_runs"
  ADD CONSTRAINT "trade_flow_runs_wallet_fk"
  FOREIGN KEY ("user_id", "wallet_id")
  REFERENCES "trade_wallets"("user_id", "id") ON DELETE CASCADE;

-- Deleting the flow stops it looking for new coins. Ladders it already placed
-- are their own rows and are deliberately left alone — see the stop rule.
ALTER TABLE "trade_flow_runs"
  ADD CONSTRAINT "trade_flow_runs_automation_fk"
  FOREIGN KEY ("automation_id")
  REFERENCES "automations"("id") ON DELETE CASCADE;

-- One switched-on copy of a flow, and one switched-on flow per wallet.
--
-- Both are the same danger said twice: a second copy running against the same
-- wallet would place a second ladder on every coin and double the position with
-- nothing on screen to say so.
CREATE UNIQUE INDEX IF NOT EXISTS "trade_flow_runs_one_per_flow"
  ON "trade_flow_runs" ("user_id", "automation_id")
  WHERE "status" = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS "trade_flow_runs_one_per_wallet"
  ON "trade_flow_runs" ("user_id", "wallet_id")
  WHERE "status" = 'running';

-- What the engine asks on every pass: which flows are still switched on.
CREATE INDEX IF NOT EXISTS "trade_flow_runs_running_idx"
  ON "trade_flow_runs" ("status", "updated_at");
