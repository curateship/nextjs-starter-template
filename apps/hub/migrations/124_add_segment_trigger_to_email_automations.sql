ALTER TABLE email_automations
DROP CONSTRAINT IF EXISTS valid_trigger_type;

ALTER TABLE email_automations
ADD CONSTRAINT valid_trigger_type
CHECK (trigger_type IN ('none', 'segment_added', 'lead_magnet_signup', 'paid_purchase'));
