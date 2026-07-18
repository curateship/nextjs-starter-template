ALTER TABLE "user_preferences" ADD COLUMN "theme" varchar(10);--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_theme_check" CHECK ("theme" in ('dark', 'light'));
