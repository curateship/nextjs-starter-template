-- Email Events table for tracking deliverability
CREATE TABLE newsletter_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES newsletter_contacts(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID,
  resend_message_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_event_type CHECK (event_type IN ('sent', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  CONSTRAINT valid_source_type CHECK (source_type IN ('automation', 'broadcast', 'transactional'))
);

CREATE INDEX idx_newsletter_events_site_created ON newsletter_events (site_id, created_at DESC);
CREATE INDEX idx_newsletter_events_contact ON newsletter_events (contact_id, created_at DESC);
CREATE INDEX idx_newsletter_events_source ON newsletter_events (source_type, source_id);
CREATE INDEX idx_newsletter_events_resend_msg ON newsletter_events (resend_message_id);
CREATE INDEX idx_newsletter_events_site_type ON newsletter_events (site_id, event_type, created_at DESC);

ALTER TABLE newsletter_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email events for their own sites" ON newsletter_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_events.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to email events" ON newsletter_events
  FOR ALL USING (auth.role() = 'service_role');
