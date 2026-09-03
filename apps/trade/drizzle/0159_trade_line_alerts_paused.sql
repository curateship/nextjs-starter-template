ALTER TABLE "trade_prefs"
ADD COLUMN IF NOT EXISTS "line_alerts_paused" boolean NOT NULL DEFAULT false;
