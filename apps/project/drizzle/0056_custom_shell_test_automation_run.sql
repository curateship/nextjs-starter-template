ALTER TABLE "automation_runs" ADD COLUMN "test_run" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "test_recipient_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_test_recipient_check" CHECK ("automation_runs"."test_run" = ("automation_runs"."test_recipient_email" IS NOT NULL) AND ("automation_runs"."test_run" = false OR "automation_runs"."subject_user_id" IS NOT NULL));
