-- Event check-in: every registration gets an unguessable ticket code (rendered
-- as a QR in the confirmation email and on its ticket page), and records the
-- moment its holder was checked in at the door.
--
-- The code is a bearer token: whoever holds it can open the ticket page, so it
-- is random rather than derived from the row id. Uppercase hex, 16 characters
-- (64 bits), matching what the app generates for new registrations in
-- src/lib/actions/events/event-check-in-core.ts.

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS check_in_code VARCHAR(16);
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- Backfill the registrations that predate this migration. gen_random_uuid() is
-- the same cryptographically strong source the id column already uses, so the
-- backfilled codes are as unguessable as the ones the app mints. The loop
-- retries on the (astronomically unlikely) collision the unique index below
-- would otherwise reject.
DO $$
DECLARE
  target UUID;
  candidate TEXT;
BEGIN
  FOR target IN SELECT id FROM event_registrations WHERE check_in_code IS NULL LOOP
    LOOP
      candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM event_registrations WHERE check_in_code = candidate);
    END LOOP;
    UPDATE event_registrations SET check_in_code = candidate WHERE id = target;
  END LOOP;
END $$;

ALTER TABLE event_registrations ALTER COLUMN check_in_code SET NOT NULL;

-- The app always supplies a code, so this default is never the value that gets
-- stored in normal operation. It exists so this migration can be run before the
-- code that writes the column is deployed: without it, that window turns every
-- new sign-up into a NOT NULL violation. Same generator as the backfill above.
ALTER TABLE event_registrations
  ALTER COLUMN check_in_code
  SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

-- The ticket page and the door screen both look a registration up by its code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_check_in_code
  ON event_registrations (check_in_code);

-- "How many of this event's attendees have actually arrived".
CREATE INDEX IF NOT EXISTS idx_event_registrations_checked_in
  ON event_registrations (event_id)
  WHERE checked_in_at IS NOT NULL;
