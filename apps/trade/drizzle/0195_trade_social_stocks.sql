-- Stocks, metals and currencies in the Social matcher, behind a per-member
-- switch that starts off.
--
-- A stock ticker collides with an ordinary English word far more often than a
-- coin ticker does: ALL, KEY, CAR, MAN and WELL are all real listings. So the
-- matcher reads them only for a member who asked, and a coin-only member's
-- rows cannot fill with false matches.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "social_match_stocks" boolean NOT NULL DEFAULT false;

-- What kind of market each matched row is.
--
-- Stored per row rather than looked up, so a creator's stock posts and coin
-- posts can be separated on screen without re-reading an exchange's list, and
-- so the row stays readable after a venue delists the market.
ALTER TABLE "trade_social_post_coins"
  ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'coin';

-- The market a chip for the row opens.
--
-- The ticker is the thing the post was about; this is the one market Trade
-- lists it on, and only the match list knows which that is. Every row written
-- before this migration is a coin, and every coin came from Hyperliquid, so
-- the existing rows are filled in rather than re-read.
ALTER TABLE "trade_social_post_coins"
  ADD COLUMN IF NOT EXISTS "market_key" varchar(64);

UPDATE "trade_social_post_coins"
  SET "market_key" = 'hyperliquid:mainnet:' || "coin"
  WHERE "market_key" IS NULL;

ALTER TABLE "trade_social_post_coins"
  ALTER COLUMN "market_key" SET NOT NULL;
