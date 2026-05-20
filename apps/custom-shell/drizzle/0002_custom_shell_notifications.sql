CREATE TABLE IF NOT EXISTS "custom_shell_notifications" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "recipient_user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "actor_user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "feedback_id" varchar(36) NOT NULL REFERENCES "custom_shell_feedback"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "feedback_vote_id" varchar(36) REFERENCES "custom_shell_feedback_votes"("id") ON DELETE CASCADE,
  "feedback_comment_id" varchar(36) REFERENCES "custom_shell_feedback_comments"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_notifications_type_check" CHECK ("type" in ('feedback_vote', 'feedback_comment'))
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_notifications_recipient_created" ON "custom_shell_notifications" ("recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_notifications_feedback_id" ON "custom_shell_notifications" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_notifications_vote_id" ON "custom_shell_notifications" ("feedback_vote_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_notifications_comment_id" ON "custom_shell_notifications" ("feedback_comment_id");
