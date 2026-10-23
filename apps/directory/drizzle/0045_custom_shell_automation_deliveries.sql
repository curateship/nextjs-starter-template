CREATE TABLE "automation_deliveries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"node_id" varchar(64) NOT NULL,
	"contact_id" varchar(36),
	"user_id" varchar(36),
	"to_email" varchar(255) NOT NULL,
	"subject" text NOT NULL,
	"provider_message_id" varchar(255),
	"status" varchar(20) NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "automation_deliveries_status_check" CHECK ("automation_deliveries"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "automation_deliveries" ADD CONSTRAINT "automation_deliveries_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_deliveries" ADD CONSTRAINT "automation_deliveries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_deliveries" ADD CONSTRAINT "automation_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_automation_deliveries_run" ON "automation_deliveries" USING btree ("run_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ix_automation_deliveries_contact" ON "automation_deliveries" USING btree ("contact_id");
--> statement-breakpoint
CREATE INDEX "ix_automation_deliveries_user" ON "automation_deliveries" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_automation_deliveries_run_node_contact" ON "automation_deliveries" USING btree ("run_id", "node_id", "contact_id") WHERE "automation_deliveries"."contact_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_automation_deliveries_run_node_email" ON "automation_deliveries" USING btree ("run_id", "node_id", lower("to_email"));
