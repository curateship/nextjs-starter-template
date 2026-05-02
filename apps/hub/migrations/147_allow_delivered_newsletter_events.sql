-- Allow Resend delivery webhooks to be stored separately from send attempts.
ALTER TABLE newsletter_events DROP CONSTRAINT IF EXISTS valid_event_type;

ALTER TABLE newsletter_events
  ADD CONSTRAINT valid_event_type
  CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'));
