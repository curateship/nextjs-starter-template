ALTER TABLE "room_reports" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_reports" ADD COLUMN "reviewed_by_user_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "room_reports" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "room_reports" ADD CONSTRAINT "room_reports_status_check" CHECK ("status" in ('pending', 'resolved', 'dismissed'));
--> statement-breakpoint
ALTER TABLE "room_reports" ADD CONSTRAINT "room_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "room_reports_reporter_message_unique" ON "room_reports" ("reporter_user_id", "message_id");
--> statement-breakpoint
CREATE INDEX "room_reports_status_created_idx" ON "room_reports" ("status", "created_at");
