-- Rooms carry their own sound and theme (rooms task 02, 7 Oct 2026).
--
-- Every account gets a personal room holding its sound and theme. It is made
-- here for every existing account, filled from the pair it already had on
-- user_preferences, and made on first read for every account after this. The
-- two old columns stay where they are and are no longer written.
CREATE TABLE IF NOT EXISTS "pomodoro_personal_rooms" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "sound" varchar(60),
  "background" varchar(60),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO "pomodoro_personal_rooms" ("user_id", "sound", "background")
SELECT "users"."id", "user_preferences"."selected_sound", "user_preferences"."selected_background"
FROM "users"
LEFT JOIN "user_preferences" ON "user_preferences"."user_id" = "users"."id"
ON CONFLICT ("user_id") DO NOTHING;

-- A hosted room, and a weekly rule that books rooms, carry the pair the host
-- picked. Null on everything made before this, which draws the default scene
-- with no sound.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "sound" varchar(60),
  ADD COLUMN IF NOT EXISTS "background" varchar(60);

ALTER TABLE "pomodoro_room_repeats"
  ADD COLUMN IF NOT EXISTS "sound" varchar(60),
  ADD COLUMN IF NOT EXISTS "background" varchar(60);
