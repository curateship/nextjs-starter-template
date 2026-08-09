-- Whether the grid, volume bars and crosshair are visible. These are chart
-- preferences rather than facts about a market, so they follow the account.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "chart_options" jsonb;
