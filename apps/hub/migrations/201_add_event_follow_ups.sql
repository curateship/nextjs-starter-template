-- Event reminders & follow-ups: a thank-you email after the event, and enough
-- send tracking to survive a rescheduled event.
--
-- The per-event switches (reminders on/off, how far ahead, follow-up on/off)
-- live on the event-content block alongside the date, time and registration
-- settings, which is where every other per-event value already lives (see
-- migration 195). Nothing here adds an events column; this is send tracking
-- only.
--
-- follow_up_sent_at is the send-once guarantee for the thank-you, exactly as
-- reminder_sent_at already is for the reminder: the cron only stamps it after a
-- successful send, so running the job twice can never email anyone twice.

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;

-- The start time the reminder actually described, e.g. `2026-08-15T18:00` (or
-- just the date for an all-day event). Its whole job is to catch a reschedule:
-- when the event moves, every attendee is holding a wrong time, so the key stops
-- matching and one corrected reminder goes out. Without it the only choice would
-- be to leave people with the old time or to re-send on every tick.
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS reminder_sent_for VARCHAR(20);

-- Backfill the rows that were reminded before this column existed, so nobody
-- gets a second copy of a reminder they already have. The key is rebuilt from
-- the event's own event-content block, which is where the date and time live.
--
-- One accepted limitation: an event that was rescheduled between its reminder
-- going out and this migration running gets its *new* start time recorded, so
-- those attendees are not sent the corrected reminder they would have had if the
-- column had existed. That is the better of the two one-time errors available
-- here — leaving the column NULL instead would re-send to every attendee of
-- every upcoming event on the first run after deploy.
UPDATE event_registrations r
SET reminder_sent_for = ec.start_key
FROM events e
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN b.value->'content'->>'eventDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN
        (b.value->'content'->>'eventDate') ||
        CASE
          WHEN b.value->'content'->>'eventTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            THEN 'T' || (b.value->'content'->>'eventTime')
          ELSE ''
        END
      ELSE ''
    END AS start_key
  FROM jsonb_each(
    CASE WHEN jsonb_typeof(e.content_blocks) = 'object' THEN e.content_blocks ELSE '{}'::jsonb END
  ) b
  WHERE b.value->>'type' = 'event-content'
  LIMIT 1
) ec
WHERE r.event_id = e.id
  AND r.reminder_sent_at IS NOT NULL
  AND r.reminder_sent_for IS NULL;

-- An event with no event-content block at all never matched the join above. It
-- can never have a due reminder either (there is no date to be due against), so
-- the empty key is honest and keeps the column meaningful for every sent row.
UPDATE event_registrations
SET reminder_sent_for = ''
WHERE reminder_sent_at IS NOT NULL
  AND reminder_sent_for IS NULL;

-- The cron now asks one question per event — "which confirmed attendees still
-- need a reminder or a thank-you" — and decides row by row, so a partial index
-- on reminder_sent_at IS NULL can no longer serve it. idx_event_registrations_
-- event_status (event_id, status) covers the new lookup, so this one is dropped
-- rather than left behind to be maintained on every write for nothing.
DROP INDEX IF EXISTS idx_event_registrations_reminder_pending;

-- Editable transactional template for the thank-you.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_email_template_key_enum') THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'event_follow_up';
  END IF;
END $$;

-- One hourly job still covers both emails; only its name was reminder-only.
UPDATE cron_jobs
SET name = 'Event reminders and follow-ups'
WHERE endpoint = '/api/cron/event-reminders';

-- Sites that predate the reminder cron never got the job registered.
INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Event reminders and follow-ups', '/api/cron/event-reminders', '0 * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/event-reminders');
