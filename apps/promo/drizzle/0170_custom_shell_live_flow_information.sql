-- A running flow says what it is doing (Tyler, 23 Nov 2026: "There should be
-- more informations when the automation is running").
--
-- `live_since` is when Run was last pressed, so the Segment card can count the
-- people who are new since then. A flow already live today counts from the
-- moment this file runs.
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "live_since" timestamp with time zone;
UPDATE "automations" SET "live_since" = now() WHERE "enabled" AND "live_since" IS NULL;

-- When admins were last told this flow had stopped moving. Cleared once nobody
-- in it is late any more, so one stall is one notice.
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "stall_alerted_at" timestamp with time zone;

-- The right panel counts the people on each step every few seconds.
CREATE INDEX IF NOT EXISTS "ix_automation_runs_automation_node"
  ON "automation_runs" ("automation_id", "current_node_id");

-- The bell's notice that a live flow has stopped moving. The list only ever
-- grows: a kind once allowed stays allowed, because notices of it may be stored.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'automation_stalled', 'account_update', 'system_email_failed', 'app_activity', 'crm_follow_up', 'crm_mail_arrived'));
