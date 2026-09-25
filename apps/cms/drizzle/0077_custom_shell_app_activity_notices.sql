-- A notice an app writes about the reader's own doing.
--
-- `app_activity` carries its own words in `message` and `detail` and belongs to
-- one person. Before it existed, an app with a sentence to put in somebody's
-- inbox had to write an announcement and point a notice at it, which filled the
-- Announcements dashboard with things nobody announced.

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed', 'app_activity'));
