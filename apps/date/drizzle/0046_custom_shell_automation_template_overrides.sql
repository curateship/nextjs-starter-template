CREATE TABLE "automation_template_overrides" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(300) NOT NULL,
	"graph" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "automation_template_overrides_user_key_unique" UNIQUE("user_id","template_key")
);
--> statement-breakpoint
ALTER TABLE "automation_template_overrides" ADD CONSTRAINT "automation_template_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ix_automation_template_overrides_user_updated" ON "automation_template_overrides" USING btree ("user_id","updated_at");
