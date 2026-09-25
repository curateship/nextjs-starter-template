-- Per-person app profile: the public name strangers see, the timezone the
-- day boundary uses, and the leaderboard opt-in. The shell's users table
-- keeps account name, email and password; this table is the app's own.
CREATE TABLE IF NOT EXISTS "pomodoro_profiles" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "public_display_name" varchar(50),
  "timezone" varchar(80) NOT NULL DEFAULT 'UTC',
  "leaderboard_opt_in" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
