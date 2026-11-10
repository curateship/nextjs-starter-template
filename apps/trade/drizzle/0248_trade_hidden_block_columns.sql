-- The columns each trade block on the Trade dashboard's left page hides from
-- its ⋮ (Tyler, 10 Nov 2026: "I want to hide certain col in the dropdown here
-- ... I want to hide avatar, type value and pnl"): Manual, Grid and DCA trades
-- each keep their own list, such as {"grid-trades": ["avatar", "type"]}. An
-- empty object hides nothing, so every account starts as it was.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "hidden_block_columns" jsonb DEFAULT '{}'::jsonb NOT NULL;
