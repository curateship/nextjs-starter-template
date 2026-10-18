-- Self-serve email change: somebody can move their account to another address
-- by proving they can read mail at the new one.
--
-- It is the same one-time hashed link the verification, reset and sign-in links
-- already use, with one extra column: the address the link would move the
-- account to. Nothing on `users` changes until the link is opened, so an
-- unfinished change leaves the account exactly as it was.
ALTER TABLE "auth_tokens"
  ADD COLUMN IF NOT EXISTS "new_email" varchar(255);

ALTER TABLE "auth_tokens"
  DROP CONSTRAINT IF EXISTS "auth_tokens_purpose_check";

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_purpose_check"
    CHECK ("purpose" in ('verify_email', 'reset_password', 'login', 'change_email'));

-- The address belongs to exactly one kind of link. Written both ways so a
-- change link can never be stored without its destination -- which would be a
-- link that does nothing when opened -- and no other kind can carry one.
ALTER TABLE "auth_tokens"
  DROP CONSTRAINT IF EXISTS "auth_tokens_new_email_check";

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_new_email_check"
    CHECK (("purpose" = 'change_email') = ("new_email" is not null));
