-- Merging two feedback items tells the duplicate's author where their words
-- went, which needs a notice kind of its own. The full list is restated
-- because a check constraint can only be replaced whole — the other kinds here
-- are exactly the ones migration 0021 left in place.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in (
    'feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog',
    'announcement', 'ai_limit_warning', 'ai_limit_reached'
  ));
