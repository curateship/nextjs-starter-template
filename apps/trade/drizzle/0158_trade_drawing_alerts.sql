ALTER TABLE "trade_chart_drawings"
ADD COLUMN IF NOT EXISTS "alert" jsonb;

CREATE INDEX IF NOT EXISTS "trade_chart_drawings_alert_idx"
  ON "trade_chart_drawings" ("market_key")
  WHERE "alert" IS NOT NULL;
