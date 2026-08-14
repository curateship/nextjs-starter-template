ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_status_check";
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_status_check" CHECK ("automation_runs"."status" in ('active', 'waiting_approval', 'completed', 'failed', 'rejected', 'canceled'));
--> statement-breakpoint
CREATE TABLE "automation_member_event_enrollments" (
  "automation_id" varchar(36) NOT NULL REFERENCES "automations" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "event" varchar(20) NOT NULL,
  "started_at" timestamptz NOT NULL,
  CONSTRAINT "automation_member_event_enrollments_pk" PRIMARY KEY ("automation_id", "user_id", "event"),
  CONSTRAINT "automation_member_event_enrollments_event_check" CHECK ("event" in ('registered', 'verified', 'subscribed', 'canceled'))
);
--> statement-breakpoint
CREATE INDEX "ix_automation_member_event_enrollments_user" ON "automation_member_event_enrollments" ("user_id");
