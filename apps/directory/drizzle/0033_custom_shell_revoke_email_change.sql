-- A "this wasn't me" link on an email change, openable from a signed-out
-- browser.
--
-- Warning the old address only helps if the person can act on the warning, and
-- the whole point of the warning is that they may be losing their way in. So
-- the link cannot require a session: it is its own one-time hashed token, the
-- same shape as every other link in this app, and holding it is the proof.
--
-- Only the list of allowed purposes changes. The revoke link carries no
-- address of its own -- it cancels whatever change is outstanding for the
-- account it belongs to -- so the pairing rule below it stays exactly as it is.
ALTER TABLE "auth_tokens"
  DROP CONSTRAINT IF EXISTS "auth_tokens_purpose_check";

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_purpose_check"
    CHECK ("purpose" in ('verify_email', 'reset_password', 'login', 'change_email', 'revoke_email_change'));
