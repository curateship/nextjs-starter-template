-- Newsletter Contacts table
CREATE TABLE newsletter_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  engagement_score INTEGER DEFAULT 0,
  last_engaged_at TIMESTAMPTZ,
  bounce_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, email),
  CONSTRAINT valid_status CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained'))
);

-- metadata contains: first_name, last_name, source, source_product_id, tags, etc.

CREATE INDEX idx_newsletter_contacts_site_status ON newsletter_contacts (site_id, status);
CREATE INDEX idx_newsletter_contacts_site_email ON newsletter_contacts (site_id, email);
CREATE INDEX idx_newsletter_contacts_site_engagement ON newsletter_contacts (site_id, engagement_score DESC);
CREATE INDEX idx_newsletter_contacts_metadata_source ON newsletter_contacts ((metadata->>'source'));

CREATE TRIGGER update_newsletter_contacts_updated_at
  BEFORE UPDATE ON newsletter_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE newsletter_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts for their own sites" ON newsletter_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_contacts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can insert contacts for their own sites" ON newsletter_contacts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_contacts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can update contacts for their own sites" ON newsletter_contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_contacts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can delete contacts for their own sites" ON newsletter_contacts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_contacts.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to contacts" ON newsletter_contacts
  FOR ALL USING (auth.role() = 'service_role');
