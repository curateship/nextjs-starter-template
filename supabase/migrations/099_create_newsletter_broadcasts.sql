-- Broadcasts table
CREATE TABLE newsletter_broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  from_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  audience_filter JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_broadcast_status CHECK (status IN ('draft', 'scheduled', 'sending', 'sent'))
);

CREATE INDEX idx_newsletter_broadcasts_site_status ON newsletter_broadcasts (site_id, status);
CREATE INDEX idx_newsletter_broadcasts_scheduled ON newsletter_broadcasts (status, scheduled_at) WHERE status = 'scheduled';

CREATE TRIGGER update_newsletter_broadcasts_updated_at
  BEFORE UPDATE ON newsletter_broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE newsletter_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view newsletter_broadcasts for their own sites" ON newsletter_broadcasts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_broadcasts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can insert newsletter_broadcasts for their own sites" ON newsletter_broadcasts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_broadcasts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can update newsletter_broadcasts for their own sites" ON newsletter_broadcasts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_broadcasts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can delete newsletter_broadcasts for their own sites" ON newsletter_broadcasts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_broadcasts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to newsletter_broadcasts" ON newsletter_broadcasts
  FOR ALL USING (auth.role() = 'service_role');
