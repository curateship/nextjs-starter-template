ALTER TABLE "trade_prefs"
ADD COLUMN IF NOT EXISTS "panel_layouts" jsonb NOT NULL
DEFAULT '{"legacyImported":false,"current":{},"named":[]}'::jsonb;
