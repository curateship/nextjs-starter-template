ALTER TABLE "automation_deliveries" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "automation_deliveries" ADD COLUMN "opened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "automation_deliveries" ADD COLUMN "clicked_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "ix_automation_deliveries_provider_message" ON "automation_deliveries" USING btree ("provider_message_id");
