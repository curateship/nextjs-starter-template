-- The bell's red number and an unread notice stop being the same thing.
--
-- Opening the bell used to mark every waiting notice read, which cleared the
-- number and emptied the Unread tab in the same instant. Tyler, 22 Sep 2026:
-- opening the bell should clear the number only. A notice is read when it is
-- clicked, or when "Mark all as read" is pressed, and not before.
--
-- So the number counts notices that are unread AND unseen, and opening the
-- bell stamps `seen_at` on everything waiting.
--
-- Every notice that already exists starts seen. They were all marked read by
-- the old behaviour anyway, and starting them unseen would put a number on the
-- bell that nobody had just been sent.

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "seen_at" timestamptz;

UPDATE "notifications" SET "seen_at" = COALESCE("read_at", now()) WHERE "seen_at" IS NULL;

-- The bell asks this question once a minute per open tab, and it is the only
-- query that reads the pair.
CREATE INDEX IF NOT EXISTS "ix_notifications_recipient_unseen"
  ON "notifications" ("recipient_user_id")
  WHERE "read_at" IS NULL AND "seen_at" IS NULL;
