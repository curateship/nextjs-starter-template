-- The calendar keeps its history when the week changes, and a moved workout
-- stays moved.

-- A workout moved to another date remembers the date it came from, so laying
-- the week out again never puts the same workout back on that date.
ALTER TABLE "fitness_scheduled_workouts" ADD COLUMN IF NOT EXISTS "moved_from" date;

-- Making a weekday a rest day, or replacing the week with a template or the
-- AI, used to delete every calendar date that weekday ever had, done ones
-- included. A date now keeps its row with no day; the dates still to come are
-- taken off by the code that lays the week out again.
ALTER TABLE "fitness_scheduled_workouts" DROP CONSTRAINT IF EXISTS "fitness_scheduled_workouts_plan_day_id_fkey";
ALTER TABLE "fitness_scheduled_workouts" DROP CONSTRAINT IF EXISTS "fitness_scheduled_workouts_day_id_fkey";
ALTER TABLE "fitness_scheduled_workouts" ALTER COLUMN "day_id" DROP NOT NULL;
ALTER TABLE "fitness_scheduled_workouts"
  ADD CONSTRAINT "fitness_scheduled_workouts_day_id_fkey"
  FOREIGN KEY ("day_id") REFERENCES "fitness_week_days" ("id") ON DELETE SET NULL;
