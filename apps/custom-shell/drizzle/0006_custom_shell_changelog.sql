CREATE TABLE IF NOT EXISTS "changelog_entries" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_changelog_entries_published_at" ON "changelog_entries" ("published_at");

-- A published update reaches people through the same notification tray as
-- feedback activity. Those two columns were required because every
-- notification used to be about a piece of feedback somebody else acted on; an
-- update is about neither, so they become optional.
ALTER TABLE "notifications" ALTER COLUMN "feedback_id" DROP NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "actor_user_id" DROP NOT NULL;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "changelog_entry_id" varchar(36)
  REFERENCES "changelog_entries"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "ix_notifications_changelog_entry_id" ON "notifications" ("changelog_entry_id");

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in ('feedback_vote', 'feedback_comment', 'changelog'));
