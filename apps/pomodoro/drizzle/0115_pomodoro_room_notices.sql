-- Room notices (account-and-notifications task 03).

-- Until when a member counts as looking at the room. The room's live
-- connection keeps it forty seconds ahead while it is open and clears it on
-- close. A member whose value is null or past is away, and only an away
-- member is told about joins, chat and reactions they would otherwise see.
ALTER TABLE "room_memberships"
  ADD COLUMN IF NOT EXISTS "watching_until" timestamp with time zone;

-- The chat message a mention or reaction notice is about, so reactions fold
-- per message and deleting the message takes its notices with it.
ALTER TABLE "pomodoro_notice_links"
  ADD COLUMN IF NOT EXISTS "message_id" uuid
    REFERENCES "room_messages" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "pomodoro_notice_links_message_idx"
  ON "pomodoro_notice_links" ("message_id")
  WHERE "message_id" IS NOT NULL;
