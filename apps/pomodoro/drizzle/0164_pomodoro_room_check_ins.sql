-- "Did you finish?" when a room's focus ends (Tyler's pick, 7 Nov 2026). One
-- answer per person per break. The break is named by the room's sequence while
-- it runs, so the next focus moving the sequence on leaves the ticks behind on
-- its own and nothing has to clear them.
CREATE TABLE IF NOT EXISTS "pomodoro_room_check_ins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "break_sequence" integer NOT NULL,
  "finished" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_room_check_ins_room_user_break_unique"
  ON "pomodoro_room_check_ins" ("room_id", "user_id", "break_sequence");
