CREATE TABLE "user_timer_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(60) NOT NULL,
	"focus_minutes" integer NOT NULL,
	"short_break_minutes" integer NOT NULL,
	"long_break_minutes" integer NOT NULL,
	"auto_start" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_timer_presets_user_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "user_timer_presets_name_check" CHECK (length(trim("name")) between 1 and 60),
	CONSTRAINT "user_timer_presets_focus_check" CHECK ("focus_minutes" between 1 and 90),
	CONSTRAINT "user_timer_presets_short_check" CHECK ("short_break_minutes" between 1 and 90),
	CONSTRAINT "user_timer_presets_long_check" CHECK ("long_break_minutes" between 1 and 90)
);
--> statement-breakpoint
ALTER TABLE "user_timer_presets" ADD CONSTRAINT "user_timer_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_timer_presets_user_idx" ON "user_timer_presets" USING btree ("user_id","created_at");
