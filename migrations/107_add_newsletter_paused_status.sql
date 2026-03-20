-- Add 'paused' as a valid broadcast status for drip sending
ALTER TABLE newsletters DROP CONSTRAINT IF EXISTS valid_broadcast_status;
ALTER TABLE newsletters ADD CONSTRAINT valid_broadcast_status
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused'));
