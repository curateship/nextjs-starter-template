ALTER TABLE trade_prefs ADD COLUMN pinned_markets jsonb NOT NULL DEFAULT '[]'::jsonb;
