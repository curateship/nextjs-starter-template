-- One remembered market per exchange, instead of one for the whole app.
--
-- Every exchange has its own dashboard now, and they shared a single memory:
-- whichever exchange you looked at last was the only page that reopened on a
-- chart, and the others opened blank as though they were broken.
--
-- The old value is kept, filed under the exchange it names, so the dashboard
-- somebody was last using still reopens exactly where they left it.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "last_market_keys" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "trade_prefs"
SET "last_market_keys" = jsonb_build_object(
    split_part("last_market_key", ':', 1),
    "last_market_key"
  )
WHERE "last_market_key" IS NOT NULL
  AND split_part("last_market_key", ':', 1) <> ''
  AND "last_market_keys" = '{}'::jsonb;

ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "last_market_key";
