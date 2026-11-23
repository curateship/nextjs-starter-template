-- The days of the week and the hours a deal runs, like "Mon to Fri, 4 to
-- 6 PM" for a happy hour. The deal is still one row with one start and end
-- day; the times only say when, inside those days, it is on.
--
-- Shaped exactly like a listing's opening hours (`directory_listings.hours`):
-- each weekday is missing or holds { open, close, second }, where `second` is
-- an optional second stretch the same day. Every weekday missing, which is
-- every deal made before this, means all day, every day of its days.
--
-- A stretch that closes at or before it opens runs past midnight and belongs
-- to the night it started, the deal's last night included. The shape is
-- checked by `cleanDealTimes` in `src/server/promotions/promotions.ts`.
ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "times" jsonb NOT NULL DEFAULT '{}'::jsonb;
