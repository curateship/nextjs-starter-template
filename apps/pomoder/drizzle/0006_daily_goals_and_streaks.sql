ALTER TABLE "user_preferences" ADD COLUMN "daily_goal_sessions" integer DEFAULT 4 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "preferences_daily_goal_check" CHECK ("daily_goal_sessions" between 1 and 20);
