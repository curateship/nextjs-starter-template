-- Magic-link sign-in: auth_tokens can now hold a one-time sign-in link, beside
-- the verification and password-reset links it already carried.
--
-- Only the allowed list of purposes changes. The row shape is identical -- the
-- same hashed single-use secret with an expiry -- so a sign-in link is stored,
-- spent, and refused by exactly the code the other two already go through.
ALTER TABLE "auth_tokens"
  DROP CONSTRAINT IF EXISTS "auth_tokens_purpose_check";

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_purpose_check"
    CHECK ("purpose" in ('verify_email', 'reset_password', 'login'));
