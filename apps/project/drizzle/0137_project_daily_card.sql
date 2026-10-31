-- The Daily card at the top of My dashboard (task "Daily card/01", Tyler,
-- 29 Oct 2026). Everyone has one card. Their hours, city and sky are kept
-- here; the habits, streaks and journal below are the site admin's alone
-- ("The habits is admin only"), and nobody else ever reads them.
CREATE TABLE IF NOT EXISTS "project_daily_cards" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  -- When morning, afternoon and night start, "HH:MM" in the person's own zone.
  "morning_at" varchar(5) NOT NULL DEFAULT '05:00',
  "afternoon_at" varchar(5) NOT NULL DEFAULT '12:00',
  "night_at" varchar(5) NOT NULL DEFAULT '18:00',
  -- The city typed in My settings, as the weather service named it, and where it is.
  "city" text,
  "latitude" double precision,
  "longitude" double precision,
  "sky" varchar(16) NOT NULL DEFAULT 'drawn',
  "own_sky_morning" text NOT NULL DEFAULT '',
  "own_sky_afternoon" text NOT NULL DEFAULT '',
  "own_sky_night" text NOT NULL DEFAULT '',
  "own_lines" text[] NOT NULL DEFAULT '{}',
  "own_questions" text[] NOT NULL DEFAULT '{}',
  -- Each routine's bell reminder, "HH:MM"; null is off.
  "reminder_morning" varchar(5) DEFAULT '10:00',
  "reminder_afternoon" varchar(5) DEFAULT '15:00',
  "reminder_night" varchar(5) DEFAULT '21:00',
  -- Streak milestones already celebrated, such as "finished:7", so each shows once.
  "celebrated" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "project_daily_cards_sky"
    CHECK ("sky" IN ('drawn', 'beach', 'city', 'mountains', 'forest', 'own'))
);

CREATE TABLE IF NOT EXISTS "project_habits" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "part" varchar(12) NOT NULL,
  "position" integer NOT NULL,
  "icon" varchar(32),
  -- How many a day counts as done: 1 for a tick, 8 for eight glasses of water.
  "target" smallint NOT NULL DEFAULT 1,
  -- Weekdays it is set for, 0 Sunday to 6 Saturday; empty is every day.
  "days" smallint[] NOT NULL DEFAULT '{}',
  "at_time" varchar(5),
  -- The first day it counts toward a streak, in the person's own zone.
  "first_day" date NOT NULL,
  -- Retired: off the card, its ticks kept. Its streak stops on this day.
  "retired_day" date,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "project_habits_part" CHECK ("part" IN ('morning', 'afternoon', 'night')),
  CONSTRAINT "project_habits_target" CHECK ("target" BETWEEN 1 AND 99)
);
CREATE INDEX IF NOT EXISTS "ix_project_habits_user" ON "project_habits" ("user_id");

-- One row per habit per day it was ticked or counted.
CREATE TABLE IF NOT EXISTS "project_habit_days" (
  "habit_id" varchar(36) NOT NULL REFERENCES "project_habits" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "count" smallint NOT NULL,
  PRIMARY KEY ("habit_id", "day")
);

-- The journal: one row per card day. The night's question is kept with its
-- answer, so changing the list of questions never changes an old answer.
CREATE TABLE IF NOT EXISTS "project_journal_days" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "intention" varchar(200) NOT NULL DEFAULT '',
  "rating" smallint,
  "note" varchar(500) NOT NULL DEFAULT '',
  "win" varchar(200) NOT NULL DEFAULT '',
  "question" varchar(200) NOT NULL DEFAULT '',
  "answer" varchar(500) NOT NULL DEFAULT '',
  "bed_at" timestamptz,
  "up_at" timestamptz,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "day"),
  CONSTRAINT "project_journal_days_rating" CHECK ("rating" BETWEEN 1 AND 5)
);

-- One bell reminder per routine per card day, written with the notice.
CREATE TABLE IF NOT EXISTS "project_routine_reminders" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "part" varchar(12) NOT NULL,
  "sent_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "day", "part")
);
