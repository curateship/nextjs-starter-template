-- The rules a person sets for themselves before a real-money entry, such as
-- "two lines above and two below" or "three minutes on the chart". Read and
-- written through `src/lib/trade/trading-rules.ts` (4 Sep 2026).
ALTER TABLE "trade_prefs" ADD COLUMN "trading_rules" jsonb;
