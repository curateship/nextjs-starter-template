-- The lines that go under every CRM reply: a name, a business, a phone number.
--
-- Plain text, not HTML and not blocks. It is a person's typing, so it is
-- escaped on the way out the same way the typed body is, and `text` rather
-- than a varchar because nobody should hit a limit writing their own address.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "crm_reply_signature" text;
