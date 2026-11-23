-- The pomodoro app's own migrations number from 0082. Table shapes are ported
-- from the old app (apps/pomoder); the tasks table follows with the tasks page.
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "focus_minutes" integer NOT NULL DEFAULT 25,
  "short_break_minutes" integer NOT NULL DEFAULT 5,
  "long_break_minutes" integer NOT NULL DEFAULT 15,
  "daily_goal_sessions" integer NOT NULL DEFAULT 4,
  "auto_start" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "preferences_focus_check" CHECK ("focus_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "preferences_short_check" CHECK ("short_break_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "preferences_long_check" CHECK ("long_break_minutes" BETWEEN 1 AND 90),
  CONSTRAINT "preferences_goal_check" CHECK ("daily_goal_sessions" BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS "focus_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id" uuid,
  "mode" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "planned_seconds" integer NOT NULL,
  "accumulated_seconds" integer NOT NULL DEFAULT 0,
  "target_ends_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "idempotency_key" varchar(100) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "focus_sessions_mode_check" CHECK ("mode" IN ('focus', 'short', 'long')),
  CONSTRAINT "focus_sessions_status_check" CHECK ("status" IN ('running', 'paused', 'completed', 'cancelled')),
  CONSTRAINT "focus_sessions_user_idempotency_unique" UNIQUE ("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "focus_sessions_user_completed_idx" ON "focus_sessions" ("user_id", "completed_at");

CREATE TABLE IF NOT EXISTS "daily_focus_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "focus_sessions" integer NOT NULL DEFAULT 0,
  "focus_seconds" integer NOT NULL DEFAULT 0,
  "tasks_completed" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "daily_focus_stats_user_date_unique" UNIQUE ("user_id", "local_date")
);
CREATE INDEX IF NOT EXISTS "daily_focus_stats_date_idx" ON "daily_focus_stats" ("local_date");
