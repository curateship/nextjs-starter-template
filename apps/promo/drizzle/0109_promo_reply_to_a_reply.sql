-- Answering the people who replied to a sent comment.
--
-- incoming_replies is the replies sitting directly under a sent comment, as
-- the last check read them: who wrote each, what it says, its address. Null
-- until a check has read them, so "not read" never looks like "nobody
-- replied".
--
-- A reply the app sends is a comment with a parent, so it is a row here too.
-- parent_id is the app's own comment it sits under, and reply_to is the
-- reply it answers, as it read when the answer was written, so the record
-- still makes sense after the reply is edited or deleted. Both null on an
-- ordinary comment.
--
-- reply_to_id on a draft is the Reddit id of the reply it was written for,
-- and '' for a draft of an ordinary comment, so the two never show in each
-- other's lists.
--
-- Additions only.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "incoming_replies" jsonb;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "parent_id" varchar(36)
  REFERENCES "promo_comments"("id") ON DELETE CASCADE;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "reply_to" jsonb;
CREATE INDEX IF NOT EXISTS "ix_promo_comments_parent" ON "promo_comments" ("parent_id");

ALTER TABLE "promo_drafts" ADD COLUMN IF NOT EXISTS "reply_to_id" varchar(20) NOT NULL DEFAULT '';
