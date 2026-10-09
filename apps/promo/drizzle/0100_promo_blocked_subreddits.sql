-- Subreddits the app never shows again. One list for the person's Reddit work,
-- not one per keyword, because the same off-topic subreddit turns up under
-- every keyword.
--
-- Nothing is deleted when a subreddit goes on the list. Its stored posts stay
-- in promo_finds and are left out when the list is read, so taking the
-- subreddit off the list brings them straight back. A search drops its posts
-- before anything is written.
--
-- Additions only.
CREATE TABLE IF NOT EXISTS "promo_blocked_subreddits" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Without the r/ prefix, as typed or as Reddit spelled it.
  "subreddit" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Reddit treats r/NoSleep and r/nosleep as one subreddit, so the list does too.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_blocked_subreddits_user_name"
  ON "promo_blocked_subreddits" ("user_id", lower("subreddit"));
