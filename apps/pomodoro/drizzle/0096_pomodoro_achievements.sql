-- Achievements: which badges a person has earned, and the day they earned it.
--
-- Only the earning is stored. What the badges are, and what each one takes,
-- lives in code (src/lib/pomodoro/achievements.ts), because a badge is a
-- promise the app made rather than data an account owns. That also means
-- adding a badge later is a code change with no migration, and an account
-- that already passed its rule earns it the next time a counter moves.
CREATE TABLE IF NOT EXISTS "pomodoro_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_id" varchar(40) NOT NULL,
  "earned_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- This index is what makes "awarded exactly once" true, rather than a check in
-- the application. The award path inserts every badge the counters satisfy and
-- lets the index throw the repeats away, so a hundredth session finishing
-- twice, or two tabs each finishing one, still leaves a single row carrying
-- the first date.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_achievements_user_badge_unique"
  ON "pomodoro_achievements" ("user_id", "badge_id");
