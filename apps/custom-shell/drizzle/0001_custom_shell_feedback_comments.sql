CREATE TABLE IF NOT EXISTS "custom_shell_feedback_comments" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "feedback_id" varchar(36) NOT NULL REFERENCES "custom_shell_feedback"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_comments_feedback_id" ON "custom_shell_feedback_comments" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_comments_user_id" ON "custom_shell_feedback_comments" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_comments_created_at" ON "custom_shell_feedback_comments" ("created_at");
