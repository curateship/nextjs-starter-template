-- What the made-up members have done towards one real member (live activity
-- task 04, Part 2, 11 Oct 2026). One row per real member whose public profile
-- the worker has seen.
--
-- `seen_public_at` is when the worker first found the profile switched on: the
-- first made-up follow comes within 48 hours of it. `follows_sent` counts the
-- follows ever sent, never the ones that still exist, so a follow an admin
-- deletes or a block drops is not sent again. `last_cheer_at` keeps the cheer
-- to one a week. The row goes with the account.
CREATE TABLE IF NOT EXISTS "pomodoro_simulated_reach" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "seen_public_at" timestamp with time zone NOT NULL,
  "follows_sent" integer NOT NULL DEFAULT 0,
  "last_follow_at" timestamp with time zone,
  "last_cheer_at" timestamp with time zone
);
