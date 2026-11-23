ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "dashboard_widgets" jsonb;
