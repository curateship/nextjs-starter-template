-- A saved search may now name one subreddit and no words, which lists that
-- subreddit's new posts: a watch. People describe a problem without using the
-- words you would think to save, so watching the place catches what a phrase
-- misses.
--
-- The one rule that stopped it was the unique index on the words, since two
-- watches both have empty words. That index now covers searches with words
-- only, exactly as before, and a second index keeps one watch per subreddit,
-- compared without case as Reddit compares names.
--
-- No column changes. A watch is a row with an empty term and one subreddit.
DROP INDEX IF EXISTS "ux_promo_keywords_user_term";

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_keywords_user_term"
  ON "promo_keywords" ("user_id", lower("term"))
  WHERE "term" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_keywords_user_watch"
  ON "promo_keywords" ("user_id", lower("subreddits"->>0))
  WHERE "term" = '';
