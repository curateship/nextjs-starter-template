CREATE TABLE IF NOT EXISTS "room_message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "room_messages"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_message_reactions_message_user_emoji_unique" ON "room_message_reactions" ("message_id", "user_id", "emoji");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_message_reactions_message_idx" ON "room_message_reactions" ("message_id");
