-- View as member: an admin can look at the app through one member's eyes.
--
-- No second session and no second cookie. The admin keeps the session they
-- signed in with and this column names the person the app should treat them as,
-- so the real owner of the session is always recoverable, exiting is one column
-- write, and signing out ends it on its own.
--
-- ON DELETE SET NULL, not CASCADE: deleting the member being viewed must drop
-- the view, never the admin's session with it.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "viewing_as_user_id" varchar(36)
  REFERENCES "users"("id") ON DELETE SET NULL;
