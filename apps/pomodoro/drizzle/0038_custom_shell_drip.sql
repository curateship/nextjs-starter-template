-- Drip sending: a newsletter goes out a few hundred at a time, waits, and only
-- during hours somebody chose — instead of the whole list as fast as the server
-- can manage.
--
-- All three columns are nullable and start empty, and an empty drip config
-- reads as "off". So this migration changes nothing about how anything sends
-- until an admin turns the switch on.

-- This newsletter's own rules: batch size, the wait between batches, the hours
-- it may send in, whether weekends count, and the bounce rate that stops it.
-- Jsonb rather than a column each because the sending hours are a list, and
-- because these are read and written as one thing by one screen.
ALTER TABLE "broadcasts"
  ADD COLUMN "drip_config" jsonb;

-- What a newly created newsletter starts from. Per workspace, beside the Resend
-- key it sends with, because both answer "how does this workspace send mail".
ALTER TABLE "email_settings"
  ADD COLUMN "drip_defaults" jsonb;

-- Stamped when Resend tells us a message bounced.
--
-- A separate column rather than a third value in `status`: that column records
-- what happened at the moment we handed the message over, and it is already
-- written by then. A bounce arrives minutes or hours later and is a different
-- fact about the same row. Keeping them apart also means `deliveries_status_check`
-- never has to change, so no stored value can be made invalid.
ALTER TABLE "deliveries"
  ADD COLUMN "bounced_at" timestamptz;

-- The bounce rate is asked for once per batch, per broadcast, and only ever
-- about rows that bounced.
CREATE INDEX IF NOT EXISTS "ix_deliveries_broadcast_bounced"
  ON "deliveries" ("broadcast_id")
  WHERE "bounced_at" is not null;
