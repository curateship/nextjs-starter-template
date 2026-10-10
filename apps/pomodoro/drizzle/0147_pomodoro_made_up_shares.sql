-- Made-up members share free files (uploads-and-sharing task 05, part 9).
-- An admin pastes Pixabay links on Settings → App settings → Made-up
-- members, and each becomes a member import for one made-up account, marked
-- here so the worker shares the finished file at once. Pixabay files are free
-- to use, and the admin is the one who vouches, so these files skip the
-- daily limit and the first-share check.
ALTER TABLE "pomodoro_member_imports"
  ADD COLUMN IF NOT EXISTS "made_up_share" boolean NOT NULL DEFAULT false;
