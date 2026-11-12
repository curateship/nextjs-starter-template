-- The order of the exchanges in the Trade dashboard's Protocols block, dragged
-- in the block's ⋮ (Tyler, 11 Nov 2026: "add ability to drag and drop order
-- for trade dashboard"). Exchange ids, first row first. An empty list keeps
-- the block's own order, so every account starts as it was.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "protocol_order" jsonb DEFAULT '[]'::jsonb NOT NULL;
