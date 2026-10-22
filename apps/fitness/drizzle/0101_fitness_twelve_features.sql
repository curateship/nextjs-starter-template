-- Twelve features of 21 Oct 2026 (workspace/tasks/New features 21 Oct/01-twelve-features.md).

-- Three more kinds of bell notice: a coach's note, the weekly check-in, and
-- the photo day reminder.
ALTER TABLE "fitness_notice_links" DROP CONSTRAINT IF EXISTS "fitness_notice_links_kind";
ALTER TABLE "fitness_notice_links"
  ADD CONSTRAINT "fitness_notice_links_kind"
  CHECK ("kind" IN ('record', 'reminder', 'missed', 'coach', 'note', 'checkin', 'photo'));

-- A planned date skipped on purpose: neither done nor missed. Moving the date
-- clears it, the same as the reminder stamps.
ALTER TABLE "fitness_scheduled_workouts" ADD COLUMN IF NOT EXISTS "skipped_at" timestamptz;
-- Stamped on every missed date of a run once its coaches were told, so a run
-- of misses sends one notice.
ALTER TABLE "fitness_scheduled_workouts" ADD COLUMN IF NOT EXISTS "coach_noticed_at" timestamptz;

-- How many weeks a program runs, counted from its start day. Null runs for good.
ALTER TABLE "fitness_programs" ADD COLUMN IF NOT EXISTS "weeks" smallint;
ALTER TABLE "fitness_programs" DROP CONSTRAINT IF EXISTS "fitness_programs_weeks";
ALTER TABLE "fitness_programs"
  ADD CONSTRAINT "fitness_programs_weeks" CHECK ("weeks" IS NULL OR "weeks" BETWEEN 1 AND 104);

-- The person's target bodyweight, the last photo day reminder, and the week
-- (its Monday) the weekly check-in was last asked for.
ALTER TABLE "fitness_profiles" ADD COLUMN IF NOT EXISTS "target_weight_kg" double precision;
ALTER TABLE "fitness_profiles" ADD COLUMN IF NOT EXISTS "photo_nudged_at" timestamptz;
ALTER TABLE "fitness_profiles" ADD COLUMN IF NOT EXISTS "check_in_asked_for" date;

-- When the coach last opened this client's check-ins, for the dot on the Clients table.
ALTER TABLE "fitness_coach_clients" ADD COLUMN IF NOT EXISTS "check_ins_seen_at" timestamptz;

-- A coach's one-way note on a client's finished workout. A null position is
-- the note on the whole workout; a position is the note on that lift.
CREATE TABLE IF NOT EXISTS "fitness_coach_notes" (
  "id" varchar(36) PRIMARY KEY,
  "workout_id" varchar(36) NOT NULL REFERENCES "fitness_workouts" ("id") ON DELETE CASCADE,
  "exercise_position" smallint,
  "coach_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "text" varchar(1000) NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_fitness_coach_notes_place"
  ON "fitness_coach_notes" ("workout_id", "coach_user_id", coalesce("exercise_position", -1));

-- A coached person's weekly check-in, one per person per week (its Monday).
-- Every answer may be left empty. The bodyweight is saved as that day's
-- weigh-in, so only the day is kept here.
CREATE TABLE IF NOT EXISTS "fitness_check_ins" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "week" date NOT NULL,
  "sleep" smallint,
  "stress" smallint,
  "training" smallint,
  "note" varchar(1000) NOT NULL,
  "weigh_in_day" date,
  "sent_at" timestamptz NOT NULL,
  CONSTRAINT "fitness_check_ins_scores" CHECK (
    ("sleep" IS NULL OR "sleep" BETWEEN 1 AND 5)
    AND ("stress" IS NULL OR "stress" BETWEEN 1 AND 5)
    AND ("training" IS NULL OR "training" BETWEEN 1 AND 5)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_fitness_check_ins_week" ON "fitness_check_ins" ("user_id", "week");

-- Calisthenics: a hold is logged in seconds, kept in the set's reps column.
ALTER TABLE "fitness_exercises" ADD COLUMN IF NOT EXISTS "is_timed" boolean NOT NULL DEFAULT false;

-- Calisthenics: a move's rep range (the target sits in "reps") and how many
-- good sessions in a row it has had toward stepping up to its next version.
ALTER TABLE "fitness_day_exercises" ADD COLUMN IF NOT EXISTS "reps_min" smallint;
ALTER TABLE "fitness_day_exercises" ADD COLUMN IF NOT EXISTS "reps_max" smallint;
ALTER TABLE "fitness_day_exercises" ADD COLUMN IF NOT EXISTS "good_streak" smallint NOT NULL DEFAULT 0;
ALTER TABLE "fitness_day_exercises" DROP CONSTRAINT IF EXISTS "fitness_day_exercises_range";
ALTER TABLE "fitness_day_exercises"
  ADD CONSTRAINT "fitness_day_exercises_range" CHECK (
    ("reps_min" IS NULL) = ("reps_max" IS NULL)
    AND ("reps_min" IS NULL OR "reps_min" BETWEEN 1 AND "reps_max")
    AND "good_streak" >= 0
  );

-- Calisthenics' own settings for one program, beside fitness_strength_settings,
-- which keeps the calendar's start day and share code for every program.
CREATE TABLE IF NOT EXISTS "fitness_calisthenics_settings" (
  "program_id" varchar(36) PRIMARY KEY REFERENCES "fitness_programs" ("id") ON DELETE CASCADE,
  "auto_step_up" boolean NOT NULL,
  "sessions_to_step" smallint NOT NULL,
  CONSTRAINT "fitness_calisthenics_sessions" CHECK ("sessions_to_step" BETWEEN 1 AND 5)
);
