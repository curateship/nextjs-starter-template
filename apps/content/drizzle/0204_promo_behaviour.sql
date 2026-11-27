-- How every account behaves, wherever it runs: the signed-out reader browser
-- that searches for it, its waking hours, its warm-up, and the pace limit for
-- young accounts. One row per person, made on the first save. A person with
-- no row gets the defaults below and no reader, so searches are refused until
-- one is picked.
--
-- Hours are minutes past midnight in the account's own time zone. 480 is
-- 8:00 and 1380 is 23:00.
--
-- Additions only.
CREATE TABLE IF NOT EXISTS "promo_behaviour_settings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "reader_profile_id" varchar(36) REFERENCES "promo_profiles"("id") ON DELETE SET NULL,
  "wake_from_minute" integer NOT NULL DEFAULT 480,
  "wake_until_minute" integer NOT NULL DEFAULT 1380,
  "warm_up_days" integer NOT NULL DEFAULT 3,
  "young_days" integer NOT NULL DEFAULT 90,
  "young_per_hour" integer NOT NULL DEFAULT 2,
  "young_per_day" integer NOT NULL DEFAULT 6,
  "warn_per_hour" integer NOT NULL DEFAULT 4,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- A job that may not start before this time. A comment pressed outside the
-- account's waking hours waits for its morning, and the daily warm-up waits
-- for a time picked at random inside them. Null starts at once, as before.
ALTER TABLE "promo_jobs" ADD COLUMN IF NOT EXISTS "run_after" timestamptz;

-- The visit around a comment, as the browser reported it: time in the feed
-- before and after, the posts opened, and how it reached the post. Null for
-- comments sent before visits, and for failed ones.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "visit" jsonb;

-- The subreddits the daily warm-up joined for an account, so it never asks to
-- join one twice.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "joined_subreddits" jsonb NOT NULL DEFAULT '[]'::jsonb;
