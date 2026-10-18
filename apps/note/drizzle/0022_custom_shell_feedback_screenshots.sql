-- One optional screenshot per feedback item. The file itself lives in the
-- media table under the author's account; deleting that media row simply
-- clears the reference here, so the feedback survives its picture.
ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "attachment_media_id" varchar(36)
  REFERENCES "media"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_feedback_attachment_media_id"
  ON "feedback" ("attachment_media_id");
