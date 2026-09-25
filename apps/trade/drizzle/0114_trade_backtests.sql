-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- Backtests: what a strategy drawn on the canvas did over months of stored
-- candles.
--
-- Two tables, because a run has two levels. The group is the whole run — one
-- pot, one strategy, one window — and that is what somebody names, pins or
-- archives; nobody pins a coin. The per-coin rows carry each coin's own trades
-- and its own status, so a coin the exchange had no history for shows on the
-- page as a **skipped row with its reason** rather than quietly missing.
--
-- The heavy columns (the trades, the pot over time) are separate from the small
-- summary on purpose: a list of fifty runs must not load fifty months of trades.
--
-- Safe to run again: every statement is guarded.
CREATE TABLE IF NOT EXISTS "trade_backtest_groups" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "automation_id" varchar(36) NOT NULL,
  "automation_name" text NOT NULL,
  -- The canvas run that started this. Here so pressing Run is safe to retry:
  -- a step that ran twice finds this row and starts nothing.
  "automation_run_id" varchar(36),
  -- Null until somebody names it, which is also what protects it from being
  -- replaced by the same flow's next run.
  "name" text,
  "pinned" boolean NOT NULL DEFAULT false,
  "archived" boolean NOT NULL DEFAULT false,
  -- The flow's settings exactly as they ran, frozen. Editing the strategy
  -- tomorrow must never rewrite what yesterday's result says it tested.
  "spec" jsonb NOT NULL,
  "summary" jsonb,
  "result" jsonb,
  "stop_requested" boolean NOT NULL DEFAULT false,
  -- Held by whichever pass is working on it, so two overlapping ticks never
  -- both run the same group. A claim older than the orphan window is taken back.
  "claimed_at" timestamp with time zone,
  "attempts" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  PRIMARY KEY ("user_id", "id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trade_backtest_groups_run_unique"
  ON "trade_backtest_groups" ("automation_run_id");

-- "The same flow's next run" is the only question asked across groups.
CREATE INDEX IF NOT EXISTS "trade_backtest_groups_flow_idx"
  ON "trade_backtest_groups" ("user_id", "automation_id");

CREATE TABLE IF NOT EXISTS "trade_backtests" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "group_id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "symbol" varchar(60) NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'waiting',
  "progress" double precision NOT NULL DEFAULT 0,
  "progress_note" text NOT NULL DEFAULT 'Waiting to start',
  "skip_reason" text,
  "error" text,
  "candles_ready" boolean NOT NULL DEFAULT false,
  "summary" jsonb,
  "trades" jsonb,
  "fills" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "group_id")
    REFERENCES "trade_backtest_groups"("user_id", "id") ON DELETE CASCADE
);

ALTER TABLE "trade_backtests"
  DROP CONSTRAINT IF EXISTS "trade_backtests_status_check";

ALTER TABLE "trade_backtests"
  ADD CONSTRAINT "trade_backtests_status_check"
  CHECK ("status" IN ('waiting', 'running', 'done', 'error', 'skipped', 'stopped'));

-- Added after the table shipped to a dev database, so it is an ALTER as well.
ALTER TABLE "trade_backtests" ADD COLUMN IF NOT EXISTS "fills" jsonb;

CREATE INDEX IF NOT EXISTS "trade_backtests_group_idx"
  ON "trade_backtests" ("user_id", "group_id");
