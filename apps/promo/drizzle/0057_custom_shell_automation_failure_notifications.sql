ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed'));
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_notifications_automation_failure_recipient" ON "notifications" USING btree ("automation_run_id", "recipient_user_id") WHERE "notifications"."type" = 'automation_failed';
