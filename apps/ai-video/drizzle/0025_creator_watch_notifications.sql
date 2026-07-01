ALTER TABLE "notifications"
  ALTER COLUMN "feedback_id" DROP NOT NULL,
  ADD COLUMN "creator_id" varchar(36) REFERENCES "creators"("id") ON DELETE CASCADE,
  ADD COLUMN "creator_new_video_count" integer;

ALTER TABLE "notifications"
  DROP CONSTRAINT "notifications_type_check";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in ('feedback_vote', 'feedback_comment', 'creator_watch'));

CREATE INDEX IF NOT EXISTS "ix_notifications_creator_id"
  ON "notifications" ("creator_id");
