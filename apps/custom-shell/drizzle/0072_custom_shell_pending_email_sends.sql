-- Keep temporary Resend failures until a later request can try them again.
-- The payload is encrypted because account emails contain live sign-in links.
CREATE TABLE IF NOT EXISTS "pending_email_sends" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind" varchar(60) NOT NULL,
  "to_email" varchar(255) NOT NULL,
  "encrypted_payload" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 1,
  "next_attempt_at" timestamp with time zone NOT NULL,
  "last_error" text NOT NULL,
  "claim_token" varchar(36),
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "pending_email_sends_status_check"
    CHECK ("status" IN ('pending', 'exhausted')),
  CONSTRAINT "pending_email_sends_attempts_check"
    CHECK ("attempts" BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS "ix_pending_email_sends_due"
  ON "pending_email_sends" ("status", "next_attempt_at");

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK (
  "notifications"."type" in ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed')
);
