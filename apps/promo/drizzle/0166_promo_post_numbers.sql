-- Your own Reddit posts read again on a press of Check (part 6 of
-- workspace/tasks/New features/new-features-18-nov.md): the upvotes, how many
-- comments, and up to 20 comments directly under the post as a stranger sees
-- them, so they can be answered. Null until a check has read them, which is
-- not the same as none.
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "upvotes" integer;
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "comment_count" integer;
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "comments" jsonb;
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "check_error" text NOT NULL DEFAULT '';

-- An answer the app sent to a comment under one of your own posts, from the
-- account that posted it. Kept as a row so it counts toward the account's
-- pace the way an answer under a comment does.
CREATE TABLE IF NOT EXISTS "promo_post_answers" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "post_id" varchar(36) NOT NULL REFERENCES "promo_posts"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "comment_url" varchar(600) NOT NULL,
  "text" text NOT NULL,
  "answer_url" varchar(600) NOT NULL DEFAULT '',
  "sent_by" text,
  "posted_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_post_answers_post" ON "promo_post_answers" ("post_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_post_answers_comment" ON "promo_post_answers" ("post_id", "comment_url");
