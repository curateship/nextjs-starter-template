-- Trade notices stop being announcements.
--
-- Every fill, alert and engine warning used to be written as an announcement
-- plus a notification pointing at it, because the notifications table looked
-- as though it had no room for a notice's own words. It has room: `message`
-- and `detail`. This moves the notices into those columns and takes the
-- stand-in announcements out of the Announcements dashboard.
--
-- The whole file runs in one transaction, so either every notice moves or none
-- does.

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed', 'app_activity'));

-- Exactly the announcements the engine wrote: addressed to the app rather than
-- to everyone, no banner, and over the moment they began. An announcement a
-- person wrote is not in here, so nothing of theirs is touched below.
CREATE TEMP TABLE "moved_announcements" ON COMMIT DROP AS
  SELECT DISTINCT a."id", a."title", a."body", a."level"
  FROM "announcements" AS a
  JOIN "notifications" AS n ON n."announcement_id" = a."id"
  WHERE n."type" = 'announcement'
    AND a."audience" = 'app'
    AND a."show_banner" = false
    AND a."starts_at" = a."ends_at";

-- Which notice each extras row belongs to, worked out while the announcement
-- it was written against is still readable. Before September a notice was
-- given an id of its own, so the row's id is the announcement's and not the
-- notice's; from September on the two are the same. This join is right either
-- way.
CREATE TEMP TABLE "notice_extras" ON COMMIT DROP AS
  SELECT n."id" AS "notice_id", l."href", l."sound_kind", m."level"
  FROM "trade_notice_links" AS l
  JOIN "moved_announcements" AS m ON m."id" = l."announcement_id"
  JOIN "notifications" AS n ON n."announcement_id" = l."announcement_id";

-- The notice keeps its id, its arrival time and its read dot. Only where its
-- words live changes.
UPDATE "notifications" AS n
SET "type" = 'app_activity',
    "message" = m."title",
    "detail" = m."body",
    "announcement_id" = NULL
FROM "moved_announcements" AS m
WHERE m."id" = n."announcement_id"
  AND n."type" = 'announcement';

-- The page and sound behind a notice now hang off the notice itself.
--
-- The old key was created inline, so Postgres named it, and the name differs
-- between a database built by these files and one built by drizzle. Whatever it
-- is called, it is the only foreign key on this table.
DO $$
DECLARE "old_key" text;
BEGIN
  SELECT "conname" INTO "old_key"
  FROM "pg_constraint"
  WHERE "conrelid" = '"trade_notice_links"'::regclass AND "contype" = 'f';
  IF "old_key" IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "trade_notice_links" DROP CONSTRAINT %I', "old_key");
  END IF;
END $$;
ALTER TABLE "trade_notice_links" RENAME COLUMN "announcement_id" TO "notice_id";
ALTER TABLE "trade_notice_links" ADD COLUMN IF NOT EXISTS "level" varchar(8) NOT NULL DEFAULT 'info';

-- Rewritten from the answer worked out above: one row per notice, holding the
-- page, the sound, and how loud the notice was.
DELETE FROM "trade_notice_links";
INSERT INTO "trade_notice_links" ("notice_id", "href", "sound_kind", "level")
  SELECT "notice_id", "href", "sound_kind", "level" FROM "notice_extras"
  ON CONFLICT DO NOTHING;

ALTER TABLE "trade_notice_links" ADD CONSTRAINT "trade_notice_links_notice_id_notifications_id_fk"
  FOREIGN KEY ("notice_id") REFERENCES "notifications"("id") ON DELETE CASCADE;

-- The stand-ins, now that no notice points at one.
DELETE FROM "announcements" AS a
USING "moved_announcements" AS m
WHERE a."id" = m."id";
