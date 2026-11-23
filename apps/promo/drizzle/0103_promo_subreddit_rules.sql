-- The rules a subreddit has posted, read once and kept, so they can be shown
-- before a comment is written and handed to the AI with the post.
--
-- One row per subreddit per person, with when it was read. Rules barely
-- change, so a reading stands for weeks. "status" keeps three answers apart:
-- 'read' (here are its rules), 'none' (it answered and has posted none) and
-- 'failed' (it would not answer, in last_error's words).
--
-- Additions only.
CREATE TABLE IF NOT EXISTS "promo_subreddit_rules" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Without the r/ prefix, as Reddit spelled it.
  "subreddit" varchar(120) NOT NULL,
  "status" varchar(20) NOT NULL,
  -- [{ "title": "...", "description": "..." }], in the subreddit's own order.
  "rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_error" text NOT NULL DEFAULT '',
  "read_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_subreddit_rules_user_name"
  ON "promo_subreddit_rules" ("user_id", lower("subreddit"));
