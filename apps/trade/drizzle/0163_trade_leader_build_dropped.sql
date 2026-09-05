-- The "newest build leads" rule is gone. It compared build times to refuse a
-- stale container the lock, but the container that kept taking the lock in
-- September 2026 was on a different server running code that had no such
-- rule. Nothing reads these two columns any more (4 Sep 2026).
ALTER TABLE "trade_worker_controls"
  DROP COLUMN IF EXISTS "leader_build_at",
  DROP COLUMN IF EXISTS "leader_build";
