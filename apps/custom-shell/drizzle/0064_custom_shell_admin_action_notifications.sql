ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "detail" text;

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK (
  "notifications"."type" in ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update')
);
