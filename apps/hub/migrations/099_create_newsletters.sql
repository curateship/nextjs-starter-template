-- LEGACY NOTE: This migration uses older Supabase-style auth/RLS patterns.
-- Current app auth is Better Auth. Validate current auth before copying `auth.*` SQL from here.
-- Broadcasts table
CREATE TABLE newsletters (
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

CREATE INDEX idx_newsletters_site_status ON newsletters (site_id, status);
CREATE INDEX idx_newsletters_scheduled ON newsletters (status, scheduled_at) WHERE status = 'scheduled';

CREATE TRIGGER update_newsletters_updated_at
  BEFORE UPDATE ON newsletters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view newsletters for their own sites" ON newsletters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletters.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can insert newsletters for their own sites" ON newsletters
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletters.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can update newsletters for their own sites" ON newsletters
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletters.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can delete newsletters for their own sites" ON newsletters
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletters.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to newsletters" ON newsletters
  FOR ALL USING (auth.role() = 'service_role');
