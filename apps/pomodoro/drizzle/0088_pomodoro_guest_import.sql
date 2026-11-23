-- The first sign-in copies a guest's tasks and settings to the account,
-- exactly once; this timestamp is the once.
ALTER TABLE "pomodoro_profiles"
  ADD COLUMN IF NOT EXISTS "guest_imported_at" timestamp with time zone;
