-- Made-up members (live activity task 01, 9 Oct 2026).
--
-- One row per made-up account. The row is the only thing that says an account
-- is made up: `users` is a shell table and gets no column for it. Deleting the
-- account deletes the row; Remove all deletes the accounts named here and no
-- others.
--
-- `habits` holds the working day (timezone, start hour, hours a day, days off,
-- session and break lengths) and the account's pool of task titles.
-- `claimed_at` is set while one pass of the worker is looking after the
-- account, so two server copies never start two sessions for one account.
CREATE TABLE IF NOT EXISTS "pomodoro_simulated_accounts" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "habits" jsonb NOT NULL,
  "personality" varchar(200) NOT NULL,
  "paused_at" timestamp with time zone,
  "claimed_at" timestamp with time zone,
  "created_by_user_id" varchar(36),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pomodoro_simulated_accounts_created_idx"
  ON "pomodoro_simulated_accounts" ("created_at");
