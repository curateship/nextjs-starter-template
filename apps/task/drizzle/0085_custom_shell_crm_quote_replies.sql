-- Whether a CRM reply carries the message it answers underneath it.
--
-- On for everybody, new workspaces and old, because every mail client quotes
-- by default and a reply that does not reads as machine-sent. Somebody
-- answering twenty short questions a day turns it off in Settings.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "crm_quote_replies" boolean NOT NULL DEFAULT true;
