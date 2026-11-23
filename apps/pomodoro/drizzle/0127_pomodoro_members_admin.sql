-- Members in the admin (admin task 06, 8 Oct 2026).
--
-- A streak day an admin put back after an outage. Kept apart from
-- daily_focus_stats, so the streak count reads it and nothing else does: the
-- leaderboard, the badges and History's hours never see a minute of it.
CREATE TABLE IF NOT EXISTS "pomodoro_streak_fixes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "reason" varchar(200) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_streak_fixes_user_date_unique"
  ON "pomodoro_streak_fixes" ("user_id", "local_date");

-- Private notes admins keep about a member. The member never reads them.
CREATE TABLE IF NOT EXISTS "pomodoro_admin_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(2000) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by_user_id" varchar(36),
  "updated_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "pomodoro_admin_notes_user_idx"
  ON "pomodoro_admin_notes" ("user_id", "created_at");

-- Taken off the leaderboard by an admin. Their own opt-in is left as it was,
-- so putting them back restores exactly what they chose.
ALTER TABLE "pomodoro_profiles"
  ADD COLUMN IF NOT EXISTS "leaderboard_hidden_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "leaderboard_hidden_by_user_id" varchar(36);

-- A badge an admin took away. The row stays, so the award check's unique index
-- keeps refusing it and the next finished focus cannot hand it straight back.
ALTER TABLE "pomodoro_achievements"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "revoked_by_user_id" varchar(36);
