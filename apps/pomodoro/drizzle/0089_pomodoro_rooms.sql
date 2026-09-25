-- Focus rooms: shared timers with a host, memberships, chat, reactions,
-- reports and bans (chat tables land now, their screens with the chat task).
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" varchar(80) NOT NULL UNIQUE,
  "name" varchar(80) NOT NULL,
  "visibility" varchar(20) NOT NULL DEFAULT 'public',
  "phase" varchar(20) NOT NULL DEFAULT 'waiting',
  "sequence" integer NOT NULL DEFAULT 0,
  "phase_started_at" timestamp with time zone,
  "phase_ends_at" timestamp with time zone,
  "focus_minutes" integer NOT NULL DEFAULT 25,
  "short_break_minutes" integer NOT NULL DEFAULT 5,
  "long_break_minutes" integer NOT NULL DEFAULT 15,
  "auto_start" boolean NOT NULL DEFAULT false,
  "cycle_focus_count" integer NOT NULL DEFAULT 0,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rooms_visibility_check" CHECK ("visibility" IN ('public', 'unlisted')),
  CONSTRAINT "rooms_cycle_focus_count_check" CHECK ("cycle_focus_count" BETWEEN 0 AND 4),
  CONSTRAINT "rooms_phase_check" CHECK ("phase" IN ('waiting', 'focus', 'short', 'long', 'closed'))
);
CREATE INDEX IF NOT EXISTS "rooms_public_idx" ON "rooms" ("visibility", "phase", "created_at");

CREATE TABLE IF NOT EXISTS "room_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "joined_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "left_at" timestamp with time zone,
  CONSTRAINT "room_memberships_role_check" CHECK ("role" IN ('host', 'member'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "room_memberships_one_active_room_per_user"
  ON "room_memberships" ("user_id") WHERE "left_at" IS NULL;
CREATE INDEX IF NOT EXISTS "room_memberships_room_active_idx" ON "room_memberships" ("room_id", "left_at");

CREATE TABLE IF NOT EXISTS "room_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(500) NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "room_messages_room_created_idx" ON "room_messages" ("room_id", "created_at");

CREATE TABLE IF NOT EXISTS "room_message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "room_messages"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "room_message_reactions_message_user_emoji_unique"
  ON "room_message_reactions" ("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "room_message_reactions_message_idx" ON "room_message_reactions" ("message_id");

CREATE TABLE IF NOT EXISTS "room_bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "banned_by_user_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "room_bans_room_user_unique" UNIQUE ("room_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "room_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "reporter_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "room_messages"("id") ON DELETE SET NULL,
  "reason" varchar(300) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reviewed_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "room_reports_status_check" CHECK ("status" IN ('pending', 'resolved', 'dismissed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "room_reports_reporter_message_unique"
  ON "room_reports" ("reporter_user_id", "message_id");
CREATE INDEX IF NOT EXISTS "room_reports_status_created_idx" ON "room_reports" ("status", "created_at");

-- A focus session can belong to a room, exactly like the old app.
ALTER TABLE "focus_sessions"
  ADD COLUMN IF NOT EXISTS "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL;
