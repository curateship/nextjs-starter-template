-- Newsletter templates table
CREATE TABLE newsletter_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_newsletter_templates_site ON newsletter_templates (site_id);

CREATE TRIGGER update_newsletter_templates_updated_at
  BEFORE UPDATE ON newsletter_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE newsletter_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view newsletter templates for their own sites" ON newsletter_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_templates.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can insert newsletter templates for their own sites" ON newsletter_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_templates.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can update newsletter templates for their own sites" ON newsletter_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_templates.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Users can delete newsletter templates for their own sites" ON newsletter_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_templates.site_id AND sites.user_id = auth.uid())
  );

CREATE POLICY "Service role full access to newsletter templates" ON newsletter_templates
  FOR ALL USING (auth.role() = 'service_role');
