-- Fitness's own tables: routines, the Strength training program, the exercise
-- library, plans, the calendar, logged workouts, weigh-ins, progress photos,
-- pauses, lifts to avoid, and coaches. Every weight is kilograms, never rounded.

-- One row per person: how they like their numbers shown and what reaches them.
CREATE TABLE IF NOT EXISTS "fitness_profiles" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "unit" varchar(2) NOT NULL DEFAULT 'kg',
  -- The smallest jump the plates allow, in kilograms.
  "step_kg" double precision NOT NULL DEFAULT 2.5,
  "bar_kg" double precision NOT NULL DEFAULT 20,
  "plates_kg" double precision[] NOT NULL DEFAULT '{25,20,15,10,5,2.5,1.25}',
  "warmups_on" boolean NOT NULL DEFAULT true,
  "time_zone" text NOT NULL DEFAULT 'UTC',
  "weekly_goal" smallint NOT NULL DEFAULT 3,
  -- Only for the strength levels, which differ by sex. Null hides them.
  "sex" varchar(6),
  "reminders_on" boolean NOT NULL DEFAULT false,
  "reminder_time" varchar(5) NOT NULL DEFAULT '07:00',
  "reminder_channel" varchar(5) NOT NULL DEFAULT 'bell',
  "missed_nudge_on" boolean NOT NULL DEFAULT false,
  -- The secret part of the calendar feed address. Reset makes a new one.
  "calendar_token" varchar(64) UNIQUE,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "fitness_profiles_unit" CHECK ("unit" IN ('kg', 'lb')),
  CONSTRAINT "fitness_profiles_sex" CHECK ("sex" IS NULL OR "sex" IN ('male', 'female')),
  CONSTRAINT "fitness_profiles_channel" CHECK ("reminder_channel" IN ('bell', 'email', 'both')),
  CONSTRAINT "fitness_profiles_reminder_time"
    CHECK ("reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- A routine is the container. Its program type decides every field and screen
-- under it, so nothing about sets or kilograms lives on this row.
CREATE TABLE IF NOT EXISTS "fitness_routines" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "program_type" varchar(32) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "archived_at" timestamptz,
  -- A coach who built this routine for the person, kept for the label only.
  "built_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_fitness_routines_user" ON "fitness_routines" ("user_id");

-- Strength training's own settings for one routine.
CREATE TABLE IF NOT EXISTS "fitness_strength_programs" (
  "routine_id" varchar(36) PRIMARY KEY REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  -- 0 = Sunday ... 6 = Saturday.
  "training_weekdays" smallint[] NOT NULL DEFAULT '{1,3,5}',
  "start_day" date NOT NULL,
  -- Which plan day the calendar hands out next, and how far it is filled.
  "next_plan_index" integer NOT NULL DEFAULT 0,
  "scheduled_through" date,
  "auto_increase" boolean NOT NULL DEFAULT true,
  "increase_kg" double precision NOT NULL DEFAULT 2.5,
  "misses_before_drop" smallint NOT NULL DEFAULT 3,
  "drop_percent" smallint NOT NULL DEFAULT 10,
  -- 0 means no blocks. Otherwise the last week of each block is lighter.
  "block_weeks" smallint NOT NULL DEFAULT 0,
  "light_week_percent" smallint NOT NULL DEFAULT 60,
  -- Set while the routine is shared as a public page.
  "share_slug" varchar(24) UNIQUE,
  CONSTRAINT "fitness_strength_programs_drop" CHECK ("drop_percent" BETWEEN 0 AND 50),
  CONSTRAINT "fitness_strength_programs_light" CHECK ("light_week_percent" BETWEEN 30 AND 100)
);

-- Built-in lifts have a slug and no owner. A person's own lifts have an owner
-- and no slug.
CREATE TABLE IF NOT EXISTS "fitness_exercises" (
  "id" varchar(36) PRIMARY KEY,
  "slug" varchar(64) UNIQUE,
  "owner_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "muscles" text[] NOT NULL DEFAULT '{}',
  "equipment" text[] NOT NULL DEFAULT '{}',
  "movement" varchar(16) NOT NULL,
  "is_bodyweight" boolean NOT NULL DEFAULT false,
  "picture_url" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "fitness_exercises_owner_or_slug"
    CHECK (("slug" IS NULL) <> ("owner_user_id" IS NULL))
);
CREATE INDEX IF NOT EXISTS "ix_fitness_exercises_owner" ON "fitness_exercises" ("owner_user_id");

-- What the person brought on day one, for one routine.
CREATE TABLE IF NOT EXISTS "fitness_baselines" (
  "routine_id" varchar(36) PRIMARY KEY REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  "bodyweight_kg" double precision,
  "height_cm" double precision,
  "chest_cm" double precision,
  "waist_cm" double precision,
  "hips_cm" double precision,
  "arm_cm" double precision,
  "thigh_cm" double precision,
  "goal" varchar(16),
  "experience" varchar(16),
  "equipment" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "fitness_baseline_lifts" (
  "routine_id" varchar(36) NOT NULL REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  "exercise_id" varchar(36) NOT NULL REFERENCES "fitness_exercises" ("id") ON DELETE CASCADE,
  "weight_kg" double precision NOT NULL,
  "reps" smallint NOT NULL,
  PRIMARY KEY ("routine_id", "exercise_id")
);

CREATE TABLE IF NOT EXISTS "fitness_plan_days" (
  "id" varchar(36) PRIMARY KEY,
  "routine_id" varchar(36) NOT NULL REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "position" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_fitness_plan_days_routine" ON "fitness_plan_days" ("routine_id");

CREATE TABLE IF NOT EXISTS "fitness_plan_exercises" (
  "id" varchar(36) PRIMARY KEY,
  "plan_day_id" varchar(36) NOT NULL REFERENCES "fitness_plan_days" ("id") ON DELETE CASCADE,
  "exercise_id" varchar(36) NOT NULL REFERENCES "fitness_exercises" ("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "sets" smallint NOT NULL,
  "reps" smallint NOT NULL,
  -- The working weight the next session uses. Automatic increases move it.
  "weight_kg" double precision NOT NULL DEFAULT 0,
  "rest_seconds" smallint NOT NULL DEFAULT 120,
  -- Exercises sharing a group are a superset, done back to back.
  "group_key" varchar(36),
  -- Sessions in a row with missed reps, for the automatic drop.
  "miss_streak" smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "ix_fitness_plan_exercises_day" ON "fitness_plan_exercises" ("plan_day_id");

-- The calendar. A row is a plan day on a date. "Missed" and "paused" are
-- worked out when it is read, from the date and the pauses.
CREATE TABLE IF NOT EXISTS "fitness_scheduled_workouts" (
  "id" varchar(36) PRIMARY KEY,
  "routine_id" varchar(36) NOT NULL REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  "plan_day_id" varchar(36) NOT NULL REFERENCES "fitness_plan_days" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "status" varchar(8) NOT NULL DEFAULT 'planned',
  "moved" boolean NOT NULL DEFAULT false,
  "workout_id" varchar(36),
  "reminded_at" timestamptz,
  "nudged_at" timestamptz,
  CONSTRAINT "fitness_scheduled_status" CHECK ("status" IN ('planned', 'done'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_fitness_scheduled_routine_day"
  ON "fitness_scheduled_workouts" ("routine_id", "day");

CREATE TABLE IF NOT EXISTS "fitness_pauses" (
  "id" varchar(36) PRIMARY KEY,
  "routine_id" varchar(36) NOT NULL REFERENCES "fitness_routines" ("id") ON DELETE CASCADE,
  "from_day" date NOT NULL,
  -- Null pauses until the person resumes.
  "until_day" date,
  "reason" varchar(16) NOT NULL DEFAULT 'holiday',
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_fitness_pauses_routine" ON "fitness_pauses" ("routine_id");

CREATE TABLE IF NOT EXISTS "fitness_workouts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "routine_id" varchar(36) REFERENCES "fitness_routines" ("id") ON DELETE SET NULL,
  "plan_day_id" varchar(36) REFERENCES "fitness_plan_days" ("id") ON DELETE SET NULL,
  "scheduled_id" varchar(36) REFERENCES "fitness_scheduled_workouts" ("id") ON DELETE SET NULL,
  "name" varchar(80) NOT NULL,
  "day" date NOT NULL,
  "source" varchar(8) NOT NULL,
  "light_week" boolean NOT NULL DEFAULT false,
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  -- How hard it felt, 1 to 10. Asked on Finish and may be skipped.
  "effort" smallint,
  "note" text NOT NULL DEFAULT '',
  -- Set on a workout read from another app's export, so a second import of
  -- the same file adds nothing.
  "import_key" varchar(160),
  CONSTRAINT "fitness_workouts_source" CHECK ("source" IN ('plan', 'empty', 'repeat', 'import')),
  CONSTRAINT "fitness_workouts_effort" CHECK ("effort" IS NULL OR "effort" BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS "ix_fitness_workouts_user_day" ON "fitness_workouts" ("user_id", "day");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_fitness_workouts_import"
  ON "fitness_workouts" ("user_id", "import_key") WHERE "import_key" IS NOT NULL;

-- One logged set. The id may come from the phone, so a set sent twice after a
-- dropped signal is saved once.
CREATE TABLE IF NOT EXISTS "fitness_workout_sets" (
  "id" varchar(36) PRIMARY KEY,
  "workout_id" varchar(36) NOT NULL REFERENCES "fitness_workouts" ("id") ON DELETE CASCADE,
  "exercise_id" varchar(36) NOT NULL REFERENCES "fitness_exercises" ("id") ON DELETE RESTRICT,
  "plan_exercise_id" varchar(36) REFERENCES "fitness_plan_exercises" ("id") ON DELETE SET NULL,
  "exercise_position" smallint NOT NULL,
  "set_number" smallint NOT NULL,
  "kind" varchar(8) NOT NULL DEFAULT 'working',
  "target_reps" smallint,
  "target_weight_kg" double precision,
  -- For a bodyweight lift this is only what was added on a belt or vest.
  "weight_kg" double precision,
  "bodyweight_kg" double precision,
  "reps" smallint,
  "done" boolean NOT NULL DEFAULT false,
  "group_key" varchar(36),
  "note" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "fitness_workout_sets_kind" CHECK ("kind" IN ('warmup', 'working'))
);
CREATE INDEX IF NOT EXISTS "ix_fitness_workout_sets_workout" ON "fitness_workout_sets" ("workout_id");
CREATE INDEX IF NOT EXISTS "ix_fitness_workout_sets_exercise" ON "fitness_workout_sets" ("exercise_id");

CREATE TABLE IF NOT EXISTS "fitness_weigh_ins" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "weight_kg" double precision NOT NULL,
  PRIMARY KEY ("user_id", "day")
);

-- Before and after photos. The keys name files in storage and never leave
-- the server; a photo is read through a signed-in request that checks it.
CREATE TABLE IF NOT EXISTS "fitness_photo_sessions" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "bodyweight_kg" double precision,
  "chest_cm" double precision,
  "waist_cm" double precision,
  "hips_cm" double precision,
  "arm_cm" double precision,
  "thigh_cm" double precision,
  "front_key" text,
  "side_key" text,
  "back_key" text,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_fitness_photo_sessions_user" ON "fitness_photo_sessions" ("user_id", "day");

CREATE TABLE IF NOT EXISTS "fitness_avoided_exercises" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "exercise_id" varchar(36) NOT NULL REFERENCES "fitness_exercises" ("id") ON DELETE CASCADE,
  "note" varchar(300) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "exercise_id")
);

CREATE TABLE IF NOT EXISTS "fitness_coach_clients" (
  "coach_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "client_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  -- Off until the client switches it on.
  "photos_allowed" boolean NOT NULL DEFAULT false,
  -- Null while the client hasn't said yes. A coach sees nothing until then.
  "accepted_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("coach_user_id", "client_user_id")
);
CREATE INDEX IF NOT EXISTS "ix_fitness_coach_clients_client" ON "fitness_coach_clients" ("client_user_id");

-- Where each of Fitness's notices in the bell leads, and what kind it is.
CREATE TABLE IF NOT EXISTS "fitness_notice_links" (
  "notice_id" varchar(36) PRIMARY KEY REFERENCES "notifications" ("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "href" text NOT NULL,
  CONSTRAINT "fitness_notice_links_kind"
    CHECK ("kind" IN ('record', 'reminder', 'missed', 'coach'))
);

-- Which left menus have had Fitness's links added, so a link an admin later
-- removes stays removed.
CREATE TABLE IF NOT EXISTS "fitness_navigation_added" (
  "scope" varchar(80) PRIMARY KEY,
  "added_at" timestamptz NOT NULL
);
