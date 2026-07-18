ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "selected_background_id";
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "selected_background" varchar(60);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_selected_background_check" CHECK ("selected_background" is null or "selected_background" ~ '^(scene:[a-z0-9_-]{1,40}|media:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
