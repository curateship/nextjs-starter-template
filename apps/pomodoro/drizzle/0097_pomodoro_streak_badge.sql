-- The public streak badge: an opt-in address that serves a small image saying
-- how many days in a row you have focused.
--
-- The secret lives on the profile rather than in a table of its own, because
-- an account has at most one badge and the badge has nothing to record beyond
-- its own address. Null is off, and off is the default, so a badge only ever
-- exists because someone asked for one.
--
-- Turning the badge off sets this back to null, which is what makes the old
-- link stop working. Asking for a new link writes a new secret, which kills
-- the old one by the same mechanism.
ALTER TABLE "pomodoro_profiles"
  ADD COLUMN IF NOT EXISTS "streak_badge_token" varchar(64);

-- Unique so one address can never resolve to two accounts. Partial, because
-- every account without a badge holds null here and those must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_profiles_streak_badge_token_unique"
  ON "pomodoro_profiles" ("streak_badge_token")
  WHERE "streak_badge_token" IS NOT NULL;
