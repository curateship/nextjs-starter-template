-- "Cold" as a fifth thing a contact can be, and the two facts needed to work
-- it out.
--
-- A contact is cold when the last several things sent to them all went
-- unopened. It is not an opinion about them: it is the only signal a sender
-- has that an address has stopped being worth mailing, and mailing addresses
-- that never open is what puts a sending domain in trouble.
--
-- Opening anything puts them straight back on the list, which the Resend
-- webhook does, so nobody has to remember to undo this.

-- Five statuses, not four. The old constraint is dropped first because
-- Postgres has no "alter check".
ALTER TABLE "contacts"
  DROP CONSTRAINT IF EXISTS "contacts_status_check";

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_status_check"
  CHECK ("status" IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cold'));

-- Whether a newsletter was opened. Automation mail has recorded this in its own
-- table all along; newsletters never did, so without this column a workspace
-- that only sends newsletters could never have a cold contact.
ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone;

-- How many unopened sends in a row it takes. Seven is what
-- systemeverything.com had been running on, and NOT NULL DEFAULT means a
-- workspace that predates this setting behaves like a new one rather than
-- having no rule at all.
ALTER TABLE "email_settings"
  ADD COLUMN IF NOT EXISTS "quiet_after_emails" integer NOT NULL DEFAULT 7;
