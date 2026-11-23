ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "selected_sound_id";
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "selected_sound" varchar(60);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "sound_volume" integer DEFAULT 70 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "sound_muted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "completion_alerts" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_sound_volume_check" CHECK ("sound_volume" between 0 and 100);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_selected_sound_check" CHECK ("selected_sound" is null or "selected_sound" ~ '^(curated:[a-z0-9_-]{1,40}|media:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
