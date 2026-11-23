-- How many followers a tracked creator has, and when that number was read.
--
-- Nullable, because nothing knows it until a reader supplies it: the pasted
-- JSON can carry it today, and a paid reading service will carry it later. A
-- creator whose count nobody has supplied shows a dash rather than a zero,
-- which would read as "nobody follows them".
ALTER TABLE "trade_social_creators"
  ADD COLUMN IF NOT EXISTS "followers" integer,
  ADD COLUMN IF NOT EXISTS "followers_at" timestamp with time zone;
