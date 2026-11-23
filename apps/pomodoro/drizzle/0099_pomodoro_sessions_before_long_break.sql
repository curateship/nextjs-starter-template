-- How many focuses earn the long break, per saved rhythm instead of the
-- hardcoded four.
--
-- The number lives twice on purpose: on the preferences row it is the rhythm
-- the timer is running right now, and on a preset row it is the rhythm that
-- preset applies. That is exactly how the three durations already work, and
-- applying a preset copies the number across the same way.
--
-- Four is the default, so every row written before today keeps the classic
-- pattern and nothing in a running app changes until somebody edits it. The
-- floor of two is the smallest cycle that still has a short break in it; the
-- ceiling of eight is where a "long break" stops meaning anything.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "sessions_before_long_break" integer NOT NULL DEFAULT 4;

ALTER TABLE "user_preferences"
  DROP CONSTRAINT IF EXISTS "preferences_long_break_cycle_check";
ALTER TABLE "user_preferences"
  ADD CONSTRAINT "preferences_long_break_cycle_check"
  CHECK ("sessions_before_long_break" BETWEEN 2 AND 8);

ALTER TABLE "user_timer_presets"
  ADD COLUMN IF NOT EXISTS "sessions_before_long_break" integer NOT NULL DEFAULT 4;

ALTER TABLE "user_timer_presets"
  DROP CONSTRAINT IF EXISTS "timer_presets_long_break_cycle_check";
ALTER TABLE "user_timer_presets"
  ADD CONSTRAINT "timer_presets_long_break_cycle_check"
  CHECK ("sessions_before_long_break" BETWEEN 2 AND 8);
