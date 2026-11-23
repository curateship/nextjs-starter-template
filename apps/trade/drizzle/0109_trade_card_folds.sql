-- Which settings cards somebody has folded away, so a window opens the way
-- they left it. One card id to open-or-shut; a card that is not in here has
-- never been touched and opens as it always did.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "card_folds" jsonb;
