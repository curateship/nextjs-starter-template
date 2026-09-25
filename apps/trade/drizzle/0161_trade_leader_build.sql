-- The build time and commit of the newest copy that has held the trading
-- lock. A copy built before it is refused the lock, so a container left on an
-- old build cannot trade while the engine restarts (3 Sep and 4 Sep 2026).
ALTER TABLE "trade_worker_controls"
  ADD COLUMN "leader_build_at" timestamp with time zone,
  ADD COLUMN "leader_build" varchar(80);
