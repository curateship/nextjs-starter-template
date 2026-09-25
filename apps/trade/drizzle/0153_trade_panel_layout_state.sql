ALTER TABLE "trade_prefs"
ALTER COLUMN "panel_layouts"
SET DEFAULT '{"legacyImported":false,"current":{},"openMarketRows":{},"headerProfitVisible":true,"activeNamedId":null,"named":[]}'::jsonb;
