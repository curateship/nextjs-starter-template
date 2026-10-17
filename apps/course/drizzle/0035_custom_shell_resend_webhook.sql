-- Resend can now call back about the mail it sent for us. A signed webhook
-- brings bounces ("this address can never receive mail") and complaints
-- ("this person marked it as spam"), and the contact list acts on them by
-- itself: those addresses drop off every future send.
--
-- The webhook's signing secret lives beside the workspace's Resend key,
-- encrypted the same way.
ALTER TABLE "email_settings"
  ADD COLUMN "resend_webhook_secret_encrypted" text;

-- Two new reasons a contact stops getting mail, kept apart from a person
-- choosing to opt out: a bounce and a spam complaint each say something
-- different, and an admin reading the list deserves to know which happened.
-- Every send already asks for 'subscribed' only, so both are excluded from
-- day one. Widening only — no stored value becomes invalid.
ALTER TABLE "contacts"
  DROP CONSTRAINT IF EXISTS "contacts_status_check";

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_status_check"
    CHECK ("status" in ('subscribed', 'unsubscribed', 'bounced', 'complained'));
