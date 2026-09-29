-- The coins each post names, as X itself tags them.
--
-- X marks them in the page it serves, so Trade reads its tagging rather than
-- hunting for dollar signs in the words. A post naming nothing keeps an empty
-- list.
ALTER TABLE "trade_social_posts"
  ADD COLUMN IF NOT EXISTS "markets" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The markets panel counts posts per coin for one creator.
CREATE INDEX IF NOT EXISTS "trade_social_posts_markets_idx"
  ON "trade_social_posts" USING gin ("markets");
