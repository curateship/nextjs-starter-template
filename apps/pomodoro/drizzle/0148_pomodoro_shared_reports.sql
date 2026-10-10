-- Reports about shared files (uploads-and-sharing task 05, parts 2 and 6).
-- Two new kinds join the queue: a member's report of a shared file, which
-- names the file, and a copyright claim from outside, which names how to
-- reply. The file id may be gone later, so only the claim's email is held
-- to on the database's side for a copyright report.
ALTER TABLE "room_reports" DROP CONSTRAINT IF EXISTS "room_reports_kind_check";
ALTER TABLE "room_reports"
  ADD CONSTRAINT "room_reports_kind_check"
  CHECK ("kind" IN ('message', 'profile', 'shared_file', 'copyright'));

ALTER TABLE "room_reports" DROP CONSTRAINT IF EXISTS "room_reports_target_check";
ALTER TABLE "room_reports"
  ADD CONSTRAINT "room_reports_target_check"
  CHECK (("kind" = 'message' AND "room_id" IS NOT NULL)
      OR ("kind" = 'profile' AND "profile_user_id" IS NOT NULL)
      OR ("kind" = 'shared_file' AND "media_id" IS NOT NULL)
      OR ("kind" = 'copyright' AND "contact_email" IS NOT NULL));
