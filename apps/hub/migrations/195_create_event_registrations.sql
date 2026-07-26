-- Event RSVPs & registration: one row per person signed up for an event, free
-- or paid. Builds on the existing block-JSON event model (date/time, and now the
-- registration mode / capacity / ticket price, live on the event-content block —
-- see migration 191, which established that model for recurrence); this table is
-- the attendee list only.
--
-- Free RSVP  -> row inserted directly with status 'confirmed'.
-- Paid ticket -> row inserted as 'pending' when the Stripe Checkout session is
--                created (this is the seat hold), flipped to 'confirmed' by the
--                webhook / success-redirect confirmation. A 'pending' row only
--                holds its seat for a short window (enforced in application code
--                via created_at), so abandoned checkouts free the seat again.

DO $$ BEGIN
  CREATE TYPE event_registration_status_enum AS ENUM ('pending', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status event_registration_status_enum NOT NULL DEFAULT 'confirmed',
  name VARCHAR(255) NOT NULL,
  -- Always stored lowercased; the dedupe index below relies on that.
  email VARCHAR(255) NOT NULL,
  -- Paid tickets only (NULL on a free RSVP): Stripe references and what was
  -- actually charged, read back from Stripe rather than trusted from the client.
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount_total INTEGER,
  currency VARCHAR(10),
  -- Set once the confirmation / reminder email has gone out, so neither is sent twice.
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live signup per person per event. Cancelled rows are excluded so an
-- attendee who cancels (or is removed by the owner) can sign up again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_event_email
  ON event_registrations (event_id, lower(email))
  WHERE status <> 'cancelled';

-- Per-site admin list, newest first.
CREATE INDEX IF NOT EXISTS idx_event_registrations_site_created
  ON event_registrations (site_id, created_at DESC, id);

-- Seat counting and the per-event admin list.
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_status
  ON event_registrations (event_id, status);

-- Idempotency for the Stripe webhook and the success-redirect confirmation:
-- duplicate deliveries confirm at most one registration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_session
  ON event_registrations (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_payment_intent
  ON event_registrations (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Reminder cron: the registrations still owed a reminder.
CREATE INDEX IF NOT EXISTS idx_event_registrations_reminder_pending
  ON event_registrations (event_id)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

-- Editable transactional templates for the two new emails.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_email_template_key_enum') THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'event_registration_confirmation';
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'event_reminder';
  END IF;
END $$;

-- Allow the "new event registration" hub notification to validate.
ALTER TABLE hub_notifications DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN ('product_order','directory_claim','directory_owner_edit','directory_featured','newsletter_paused','directory_featured_expired','event_submission','directory_submission','event_registration'));

-- Register the reminder cron with the unified runner. Hourly is enough for a
-- reminder measured in hours before the event.
INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Event reminders', '/api/cron/event-reminders', '0 * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/event-reminders');
