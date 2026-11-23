-- Tyler, 18 Oct 2026: a program is what a person creates and names, like a
-- project, and its routine is the type (Strength training). A program is one
-- fixed week: each weekday is a workout or rest. Exercises are tagged by
-- routine type. Every setting is one app-wide answer in Settings, App settings.

-- Routines become programs; the old "program type" is the routine type.
ALTER TABLE "fitness_routines" RENAME TO "fitness_programs";
ALTER TABLE "fitness_programs" RENAME COLUMN "program_type" TO "routine_type";
ALTER INDEX IF EXISTS "ix_fitness_routines_user" RENAME TO "ix_fitness_programs_user";

ALTER TABLE "fitness_strength_programs" RENAME TO "fitness_strength_settings";
ALTER TABLE "fitness_strength_settings" RENAME COLUMN "routine_id" TO "program_id";
ALTER TABLE "fitness_baselines" RENAME COLUMN "routine_id" TO "program_id";
ALTER TABLE "fitness_baseline_lifts" RENAME COLUMN "routine_id" TO "program_id";
ALTER TABLE "fitness_scheduled_workouts" RENAME COLUMN "routine_id" TO "program_id";
ALTER TABLE "fitness_pauses" RENAME COLUMN "routine_id" TO "program_id";
ALTER TABLE "fitness_workouts" RENAME COLUMN "routine_id" TO "program_id";
ALTER INDEX IF EXISTS "ux_fitness_scheduled_routine_day" RENAME TO "ux_fitness_scheduled_program_day";
ALTER INDEX IF EXISTS "ix_fitness_pauses_routine" RENAME TO "ix_fitness_pauses_program";

-- Training days become the fixed week: one row per weekday that holds a
-- workout, none for a rest day.
ALTER TABLE "fitness_plan_days" RENAME TO "fitness_week_days";
ALTER TABLE "fitness_week_days" RENAME COLUMN "routine_id" TO "program_id";
ALTER INDEX IF EXISTS "ix_fitness_plan_days_routine" RENAME TO "ix_fitness_week_days_program";
ALTER TABLE "fitness_week_days" ADD COLUMN IF NOT EXISTS "weekday" smallint;

-- Each old day takes the training weekday at its place in the rotation; a
-- day beyond the training weekdays takes the first free weekday, and a day
-- beyond seven has nowhere to go and is removed.
DO $$
DECLARE
  day_row record;
  free_day smallint;
BEGIN
  FOR day_row IN
    SELECT d."id", d."program_id",
      row_number() OVER (PARTITION BY d."program_id" ORDER BY d."position") AS place,
      s."training_weekdays" AS weekdays
    FROM "fitness_week_days" d
    JOIN "fitness_strength_settings" s ON s."program_id" = d."program_id"
    ORDER BY d."program_id", d."position"
  LOOP
    IF day_row.place <= coalesce(array_length(day_row.weekdays, 1), 0)
      AND NOT EXISTS (
        SELECT 1 FROM "fitness_week_days"
        WHERE "program_id" = day_row."program_id" AND "weekday" = day_row.weekdays[day_row.place]
      )
    THEN
      UPDATE "fitness_week_days" SET "weekday" = day_row.weekdays[day_row.place] WHERE "id" = day_row."id";
    ELSE
      SELECT candidate INTO free_day
      FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 0]::smallint[]) AS candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM "fitness_week_days"
        WHERE "program_id" = day_row."program_id" AND "weekday" = candidate
      )
      LIMIT 1;
      IF free_day IS NULL THEN
        DELETE FROM "fitness_week_days" WHERE "id" = day_row."id";
      ELSE
        UPDATE "fitness_week_days" SET "weekday" = free_day WHERE "id" = day_row."id";
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "fitness_week_days" ALTER COLUMN "weekday" SET NOT NULL;
ALTER TABLE "fitness_week_days" DROP COLUMN IF EXISTS "position";
ALTER TABLE "fitness_week_days"
  ADD CONSTRAINT "fitness_week_days_weekday" CHECK ("weekday" BETWEEN 0 AND 6);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_fitness_week_days_program_weekday"
  ON "fitness_week_days" ("program_id", "weekday");

ALTER TABLE "fitness_plan_exercises" RENAME TO "fitness_day_exercises";
ALTER TABLE "fitness_day_exercises" RENAME COLUMN "plan_day_id" TO "day_id";
ALTER INDEX IF EXISTS "ix_fitness_plan_exercises_day" RENAME TO "ix_fitness_day_exercises_day";
ALTER TABLE "fitness_scheduled_workouts" RENAME COLUMN "plan_day_id" TO "day_id";
ALTER TABLE "fitness_workouts" RENAME COLUMN "plan_day_id" TO "day_id";
ALTER TABLE "fitness_workout_sets" RENAME COLUMN "plan_exercise_id" TO "day_exercise_id";
ALTER TABLE "fitness_workouts" DROP CONSTRAINT IF EXISTS "fitness_workouts_source";
UPDATE "fitness_workouts" SET "source" = 'day' WHERE "source" = 'plan';
ALTER TABLE "fitness_workouts"
  ADD CONSTRAINT "fitness_workouts_source" CHECK ("source" IN ('day', 'empty', 'repeat', 'import'));

-- The weekdays now come from the week itself, and there is no rotation.
ALTER TABLE "fitness_strength_settings" DROP COLUMN IF EXISTS "training_weekdays";
ALTER TABLE "fitness_strength_settings" DROP COLUMN IF EXISTS "next_plan_index";

-- The calendar is laid out again from today with the new weekdays.
DELETE FROM "fitness_scheduled_workouts"
  WHERE "status" = 'planned' AND "moved" = false AND "day" >= current_date;
UPDATE "fitness_strength_settings" SET "scheduled_through" = NULL;

-- Exercises belong to a routine type, so a program only offers its own.
ALTER TABLE "fitness_exercises"
  ADD COLUMN IF NOT EXISTS "routine_type" varchar(32) NOT NULL DEFAULT 'strength';

-- App-wide settings, one row per group, edited in Settings, App settings.
CREATE TABLE IF NOT EXISTS "fitness_app_settings" (
  "key" varchar(40) PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL
);

-- What the first person chose becomes the app-wide answer, so nothing they
-- already set is lost.
INSERT INTO "fitness_app_settings" ("key", "value", "updated_at")
SELECT 'units', jsonb_build_object('unit', "unit", 'stepKg', "step_kg", 'barKg', "bar_kg", 'platesKg', to_jsonb("plates_kg")), now()
FROM "fitness_profiles" ORDER BY "created_at" LIMIT 1
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "fitness_app_settings" ("key", "value", "updated_at")
SELECT 'workouts', jsonb_build_object('warmupsOn', "warmups_on", 'weeklyGoal', "weekly_goal", 'sex', "sex"), now()
FROM "fitness_profiles" ORDER BY "created_at" LIMIT 1
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "fitness_app_settings" ("key", "value", "updated_at")
SELECT 'reminders', jsonb_build_object('remindersOn', "reminders_on", 'time', "reminder_time", 'channel', "reminder_channel", 'nudgeOn', "missed_nudge_on"), now()
FROM "fitness_profiles" ORDER BY "created_at" LIMIT 1
ON CONFLICT ("key") DO NOTHING;

-- A person keeps only their own clock and their calendar feed's secret.
ALTER TABLE "fitness_profiles" DROP CONSTRAINT IF EXISTS "fitness_profiles_unit";
ALTER TABLE "fitness_profiles" DROP CONSTRAINT IF EXISTS "fitness_profiles_sex";
ALTER TABLE "fitness_profiles" DROP CONSTRAINT IF EXISTS "fitness_profiles_channel";
ALTER TABLE "fitness_profiles" DROP CONSTRAINT IF EXISTS "fitness_profiles_reminder_time";
ALTER TABLE "fitness_profiles"
  DROP COLUMN IF EXISTS "unit",
  DROP COLUMN IF EXISTS "step_kg",
  DROP COLUMN IF EXISTS "bar_kg",
  DROP COLUMN IF EXISTS "plates_kg",
  DROP COLUMN IF EXISTS "warmups_on",
  DROP COLUMN IF EXISTS "weekly_goal",
  DROP COLUMN IF EXISTS "sex",
  DROP COLUMN IF EXISTS "reminders_on",
  DROP COLUMN IF EXISTS "reminder_time",
  DROP COLUMN IF EXISTS "reminder_channel",
  DROP COLUMN IF EXISTS "missed_nudge_on";

-- Bell notices and the left menu point at the new dashboards.
UPDATE "fitness_notice_links"
  SET "href" = regexp_replace("href", '^/training\?routine=([A-Za-z0-9-]+).*$', '/programs/\1')
  WHERE "href" LIKE '/training?routine=%';
UPDATE "fitness_notice_links"
  SET "href" = regexp_replace("href", '^/routines/([A-Za-z0-9-]+).*$', '/programs/\1')
  WHERE "href" ~ '^/routines/[A-Za-z0-9-]+';
UPDATE "fitness_notice_links" SET "href" = '/programs'
  WHERE "href" LIKE '/training%' OR "href" LIKE '/progress%' OR "href" LIKE '/routines%';

UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{memberSections}',
  (
    SELECT jsonb_agg(
      CASE WHEN section ->> 'id' = 'section-fitness' THEN
        '{"id":"section-fitness","title":"Training","entries":[{"type":"item","id":"item-fitness-programs","label":"Programs","href":"/programs","icon":"dumbbell","visible":true},{"type":"item","id":"item-fitness-exercises","label":"Exercises","href":"/exercises","icon":"list","visible":true}]}'::jsonb
      ELSE section END
      ORDER BY place
    )
    FROM jsonb_array_elements("settings" -> 'memberSections') WITH ORDINALITY AS list(section, place)
  )
)
WHERE jsonb_typeof("settings" -> 'memberSections') = 'array'
  -- Only a menu that holds the section: an empty list would come back NULL.
  AND "settings" -> 'memberSections' @> '[{"id":"section-fitness"}]';

UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE WHEN section ->> 'id' = 'section-fitness' THEN
        '{"id":"section-fitness","title":"Training","entries":[{"type":"item","id":"item-fitness-programs","label":"Programs","href":"/programs","icon":"dumbbell","visible":true},{"type":"item","id":"item-fitness-exercises","label":"Exercises","href":"/exercises","icon":"list","visible":true}]}'::jsonb
      ELSE section END
      ORDER BY place
    )
    FROM jsonb_array_elements("settings" -> 'sections') WITH ORDINALITY AS list(section, place)
  )
)
WHERE jsonb_typeof("settings" -> 'sections') = 'array'
  AND "settings" -> 'sections' @> '[{"id":"section-fitness"}]';
