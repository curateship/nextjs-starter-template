-- The name a CRM reply goes out under, so a customer sees a person rather than
-- a bare inbox address.
--
-- Only the name is saved. The address stays the inbound address, because a
-- reply has to come back into the CRM. Empty falls back to the app name at
-- send time rather than being written in here, so renaming the app renames
-- the sender too.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "crm_reply_name" varchar(255);
