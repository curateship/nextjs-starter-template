-- The single remembered market and wallet, removed now that nothing reads
-- them.
--
-- This is the second half of 0132 and 0133. Those two added a memory per
-- exchange and deliberately LEFT the old single one alone, because the
-- release still serving at that moment was reading it — see "Why that order
-- matters" in docs/deployment.md. That release is gone, so the old columns
-- are dead weight holding a stale copy, and they go here.
--
-- `IF EXISTS` because they are already gone from the development database,
-- where 0132 and 0133 dropped them before this was thought through.
ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "last_market_key";
ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "last_wallet_id";
