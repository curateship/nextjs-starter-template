-- What each of this app's bell notices is about. Every Pomodoro notice is the
-- shell's `app_activity` type, so the kind and the room live here, written in
-- the same transaction as the notice.

CREATE TABLE IF NOT EXISTS "pomodoro_notice_links" (
  "notice_id" varchar(36) PRIMARY KEY NOT NULL
    REFERENCES "notifications" ("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  -- Null on a notice that is not about a room, and on one whose room was
  -- deleted: the notice keeps its kind and stops leading anywhere.
  "room_id" uuid REFERENCES "rooms" ("id") ON DELETE SET NULL
);

-- Opening a room marks that room's notices read, which starts from the room.
CREATE INDEX IF NOT EXISTS "pomodoro_notice_links_room_idx"
  ON "pomodoro_notice_links" ("room_id")
  WHERE "room_id" IS NOT NULL;

-- Cheers sent before this table existed. A cheer is the only notice this app
-- had written, and its sentence always ends " cheered you on."
INSERT INTO "pomodoro_notice_links" ("notice_id", "kind")
SELECT "id", 'cheer'
FROM "notifications"
WHERE "type" = 'app_activity'
  AND "actor_user_id" IS NOT NULL
  AND "message" LIKE '% cheered you on.'
ON CONFLICT ("notice_id") DO NOTHING;
