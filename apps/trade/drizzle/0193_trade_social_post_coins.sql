-- Which coins a post names, worked out from the words rather than from X's own
-- tagging.
--
-- One row per coin per post. `matched_as` and `matched_text` are the record of
-- why the row is here: a false match costs nothing to make and is invisible on
-- screen, so the words that matched are kept and can be read back.
CREATE TABLE IF NOT EXISTS "trade_social_post_coins" (
  "post_id" varchar(36) NOT NULL
    REFERENCES "trade_social_posts" ("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL
    REFERENCES "trade_social_creators" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "coin" varchar(20) NOT NULL,
  "matched_as" varchar(14) NOT NULL,
  "matched_text" varchar(60) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("post_id", "coin")
);

-- The markets panel counts one creator's posts per coin.
CREATE INDEX IF NOT EXISTS "trade_social_post_coins_creator_idx"
  ON "trade_social_post_coins" ("creator_id", "coin");

-- When the words of a post were last read for coins.
--
-- Null means never. The mark is what makes a post naming no coin an answer
-- rather than one the backfill pass picks up every time it runs. Re-read coins
-- sets it back to null for a whole creator.
ALTER TABLE "trade_social_posts"
  ADD COLUMN IF NOT EXISTS "coins_read_at" timestamp with time zone;

-- The backfill pass asks for one creator's unread posts.
CREATE INDEX IF NOT EXISTS "trade_social_posts_coins_unread_idx"
  ON "trade_social_posts" ("creator_id", "posted_at")
  WHERE "coins_read_at" IS NULL;

-- X's own cashtag list goes with it.
--
-- Trade reads the words itself now, filtered to coins it has a market for, so
-- this column had no reader left. It was also wrong more often than the words
-- are: X tags a quoted post's coins onto the post that quoted it, which
-- credited a creator with coins he never wrote.
--
-- **This deletes the stored tagging.** It is X's answer, not Trade's, and X
-- serves it again on the next sync of any post that still matters.
DROP INDEX IF EXISTS "trade_social_posts_markets_idx";
ALTER TABLE "trade_social_posts" DROP COLUMN IF EXISTS "markets";
