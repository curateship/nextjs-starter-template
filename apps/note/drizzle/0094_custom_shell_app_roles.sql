-- An account's role can now be one its app declared, beside admin and member.
--
-- Tyler, 16 Oct 2026: "We'd have admin, pro, free and other types of users
-- such as employee or for example in cms, we'd need to add another user type
-- for venues owners that claimed their listing." The role column is that type,
-- so it grows rather than a second column joining it.
--
-- A CHECK cannot read the app's options, so the list moves to the server: every
-- role written goes through requireKnownRole (src/server/people/roles.ts). The
-- database keeps the shape only. Every existing row is admin or member, and
-- both match it, so no row changes.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check" CHECK ("role" ~ '^[a-z][a-z0-9_]{0,49}$');
