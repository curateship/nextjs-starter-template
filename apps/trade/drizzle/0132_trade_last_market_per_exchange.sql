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

-- The old column is LEFT IN PLACE on purpose. The release running right now
-- still reads it, and Coolify keeps that container serving while the new one
-- starts — so dropping it here would break the site for the minute the two
-- overlap. Removing it is a later release, once nothing reads it. See
-- "Why that order matters" in docs/deployment.md.
