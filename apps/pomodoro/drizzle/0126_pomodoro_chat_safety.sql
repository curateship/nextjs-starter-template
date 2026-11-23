-- Chat and safety (admin task 05, 8 Oct 2026).
--
-- A removed message now says who removed it: the host, as before, or an
-- admin. A message with a blocked word can be held for an admin to let
-- through. And an admin can post one line into every live room, pinned.
ALTER TABLE "room_messages"
  ADD COLUMN IF NOT EXISTS "removed_by" varchar(10),
  ADD COLUMN IF NOT EXISTS "held_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "broadcast" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "room_messages_held_idx"
  ON "room_messages" ("held_at")
  WHERE "held_at" IS NOT NULL;

-- A warning an admin sent a member. Kept so the next admin can see it.
CREATE TABLE IF NOT EXISTS "pomodoro_warnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" varchar(500) NOT NULL,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pomodoro_warnings_user_idx" ON "pomodoro_warnings" ("user_id", "created_at");

-- A member barred from every room for a while, or until lifted.
CREATE TABLE IF NOT EXISTS "pomodoro_suspensions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" varchar(300) NOT NULL,
  "ends_at" timestamp with time zone,
  "created_by_user_id" varchar(36) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lifted_at" timestamp with time zone,
  "lifted_by_user_id" varchar(36)
);
CREATE INDEX IF NOT EXISTS "pomodoro_suspensions_user_idx" ON "pomodoro_suspensions" ("user_id") WHERE "lifted_at" IS NULL;
