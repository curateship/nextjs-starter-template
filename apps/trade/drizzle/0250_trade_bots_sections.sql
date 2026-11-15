-- The Bots dashboard's Dashboards block, from its ⋮ (Tyler, 11 Nov 2026: "add
-- this same feature for all apps that has dashboards block"): the sections it
-- leaves out, and their order, each admin's own. Empty lists hide nothing and
-- keep the block's own order, so every account starts as it was.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "hidden_bots_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "bots_section_order" jsonb DEFAULT '[]'::jsonb NOT NULL;
