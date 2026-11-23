-- Streak saver reminder (old task 26): an evening nudge in the bell when the
-- streak is alive and today has no finished focus yet. Off until the member
-- switches it on. There is no email version. The hour is the member's own local hour,
-- read against the timezone on their profile. `streak_reminder_on` is the
-- local day the reminder was last considered, so one person is looked at once
-- per day and never nudged twice in it.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "streak_reminder_bell" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "streak_reminder_hour" integer NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS "streak_reminder_on" date;
DO $$ BEGIN
  ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_streak_reminder_hour_check"
    CHECK ("streak_reminder_hour" BETWEEN 12 AND 23);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
