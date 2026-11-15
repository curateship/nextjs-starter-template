-- A notice when mail lands (CRM task 10, built in task 36, 7 Nov 2026): the
-- bell says who wrote in and about what. A new kind of notice, so the type
-- check widens. The list only ever grows: a kind once allowed stays allowed,
-- because notices of it may be stored.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed', 'app_activity', 'crm_follow_up', 'crm_mail_arrived'));
