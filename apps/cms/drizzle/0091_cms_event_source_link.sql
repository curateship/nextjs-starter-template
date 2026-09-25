-- The page an automation read to draft an event, from the Draft events step.
--
-- Shown in the event's window in Admin → Events so the admin can check the
-- day and time against the page before publishing, because the AI that read
-- it can misread a date. Never shown to a visitor. Empty for every event a
-- person made, and a duplicate starts empty too.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "source_url" varchar(600) NOT NULL DEFAULT '';
