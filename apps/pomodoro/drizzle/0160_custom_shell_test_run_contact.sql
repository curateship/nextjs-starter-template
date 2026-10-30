-- A test run is now about one contact rather than one account.
--
-- Tyler, 17 Oct 2026, on the Test with one member picker: "it should search
-- contacts, not users". A contact may have no account behind it, so a test run
-- needs a contact or an account, not always an account. Every existing test
-- run has an account, so no row changes.
ALTER TABLE "automation_runs" DROP CONSTRAINT IF EXISTS "automation_runs_test_recipient_check";
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_test_recipient_check" CHECK ("automation_runs"."test_run" = ("automation_runs"."test_recipient_email" IS NOT NULL) AND ("automation_runs"."test_run" = false OR "automation_runs"."subject_contact_id" IS NOT NULL OR "automation_runs"."subject_user_id" IS NOT NULL));
