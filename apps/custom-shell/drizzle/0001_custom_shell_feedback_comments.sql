CREATE TABLE IF NOT EXISTS "feedback_comments" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "feedback_id" varchar(36) NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_feedback_comments_feedback_id" ON "feedback_comments" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_comments_user_id" ON "feedback_comments" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_comments_created_at" ON "feedback_comments" ("created_at");
