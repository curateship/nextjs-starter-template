ALTER TABLE "trade_market_folders"
ADD COLUMN "hidden" boolean NOT NULL DEFAULT false;

ALTER TABLE "trade_prefs"
ADD COLUMN "market_panel_rows" jsonb NOT NULL DEFAULT '{}'::jsonb;
