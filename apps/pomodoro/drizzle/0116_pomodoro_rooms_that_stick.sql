-- Rooms that stick (rooms task 01): weekly rooms, the shared task line, My
-- rooms, and the index the "focused with" list reads.

-- Part 1. A weekly room is a rule, not a room. The worker turns each
-- occurrence into an ordinary booked room a day before it starts. `weekdays`
-- is the same seven-bit set as pomodoro_task_repeats (bit 0 Sunday through
-- bit 6 Saturday). The time is minutes after midnight on the host's clock,
-- held with the timezone it was typed in, so 9am stays 9am across a clock
-- change. `next_starts_at` is when the next day still to be booked starts.
-- The worker moves it on each time it books a day, and Cancel this week moves
-- it on without booking, so each pass reads only the rules due soon.
CREATE TABLE IF NOT EXISTS "pomodoro_room_repeats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "visibility" varchar(20) NOT NULL DEFAULT 'public',
  "weekdays" integer NOT NULL,
  "start_minute" integer NOT NULL,
  "timezone" varchar(80) NOT NULL,
  "focus_minutes" integer NOT NULL DEFAULT 25,
  "short_break_minutes" integer NOT NULL DEFAULT 5,
  "long_break_minutes" integer NOT NULL DEFAULT 15,
  "auto_start" boolean NOT NULL DEFAULT false,
  "invites" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "next_starts_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_room_repeats_visibility_check" CHECK ("visibility" IN ('public', 'unlisted')),
  CONSTRAINT "pomodoro_room_repeats_weekdays_check" CHECK ("weekdays" BETWEEN 1 AND 127),
  CONSTRAINT "pomodoro_room_repeats_start_minute_check" CHECK ("start_minute" BETWEEN 0 AND 1439)
);
CREATE INDEX IF NOT EXISTS "pomodoro_room_repeats_host_idx"
  ON "pomodoro_room_repeats" ("host_user_id");
CREATE INDEX IF NOT EXISTS "pomodoro_room_repeats_next_idx"
  ON "pomodoro_room_repeats" ("next_starts_at")
  WHERE "cancelled_at" IS NULL;

-- Which rule made a room, and for which of the rule's days. The unique pair
-- is what stops two worker passes both making the same Tuesday.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "repeat_id" uuid
    REFERENCES "pomodoro_room_repeats" ("id") ON DELETE SET NULL;
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "occurrence_date" date;
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_repeat_occurrence_unique"
  ON "rooms" ("repeat_id", "occurrence_date")
  WHERE "repeat_id" IS NOT NULL;

-- Part 2. Off for everyone, because a task title can name a client.
ALTER TABLE "pomodoro_profiles"
  ADD COLUMN IF NOT EXISTS "share_task_in_rooms" boolean NOT NULL DEFAULT false;

-- Part 3. Whether this membership keeps the room on the person's My rooms
-- list after they leave. Every join from now on sets it. Rows written before
-- this existed stay off, so the list starts empty rather than filling with
-- every room anyone ever tried.
ALTER TABLE "room_memberships"
  ADD COLUMN IF NOT EXISTS "saved" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "room_memberships_user_saved_idx"
  ON "room_memberships" ("user_id", "room_id")
  WHERE "saved";

-- Part 4. One person's memberships from a date onwards, which is where the
-- "focused with" list starts. Without it that read is a scan of every
-- membership there has ever been.
CREATE INDEX IF NOT EXISTS "room_memberships_user_joined_idx"
  ON "room_memberships" ("user_id", "joined_at");
