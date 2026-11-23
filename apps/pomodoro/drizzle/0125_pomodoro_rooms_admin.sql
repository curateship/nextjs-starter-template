-- Rooms in the admin (admin task 04, 8 Oct 2026): a room or a weekly rule an
-- admin features sits first on Browse rooms, and house presets hosts can pick.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "featured_at" timestamp with time zone;

ALTER TABLE "pomodoro_room_repeats"
  ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "pomodoro_room_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(60) NOT NULL,
  "focus_minutes" integer NOT NULL,
  "short_break_minutes" integer NOT NULL,
  "long_break_minutes" integer NOT NULL,
  "auto_start" boolean NOT NULL DEFAULT false,
  "sound" varchar(200),
  "background" varchar(200),
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_room_presets_focus_check" CHECK ("focus_minutes" between 1 and 90),
  CONSTRAINT "pomodoro_room_presets_short_check" CHECK ("short_break_minutes" between 1 and 90),
  CONSTRAINT "pomodoro_room_presets_long_check" CHECK ("long_break_minutes" between 1 and 90)
);
