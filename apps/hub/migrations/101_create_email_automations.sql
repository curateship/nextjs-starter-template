-- Email Automations (drip sequences)
CREATE TABLE email_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  trigger_type VARCHAR(50) NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  goal_type VARCHAR(50),
  goal_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_automation_status CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT valid_trigger_type CHECK (trigger_type IN ('lead_magnet_signup', 'paid_purchase'))
);

ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own email automations" ON email_automations
  FOR ALL USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = email_automations.site_id AND sites.user_id = auth.uid()));
CREATE POLICY "Service role full access to email automations" ON email_automations
  FOR ALL USING (auth.role() = 'service_role');

-- Automation Steps (nodes: email or delay)
CREATE TABLE email_automation_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES email_automations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  node_type VARCHAR(20) NOT NULL DEFAULT 'email',
  node_config JSONB DEFAULT '{}',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  subject VARCHAR(255),
  content TEXT NOT NULL DEFAULT '',
  from_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(automation_id, step_order),
  CONSTRAINT valid_node_type CHECK (node_type IN ('email', 'delay'))
);

ALTER TABLE email_automation_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage steps for their automations" ON email_automation_steps
  FOR ALL USING (EXISTS (
    SELECT 1 FROM email_automations a JOIN sites s ON s.id = a.site_id
    WHERE a.id = email_automation_steps.automation_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Service role full access to automation steps" ON email_automation_steps
  FOR ALL USING (auth.role() = 'service_role');

-- Automation Enrollments
CREATE TABLE email_automation_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES email_automations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES newsletter_contacts(id) ON DELETE CASCADE,
  current_step_order INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  goal_met_at TIMESTAMPTZ,
  last_step_sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  UNIQUE(automation_id, contact_id),
  CONSTRAINT valid_enrollment_status CHECK (status IN ('active', 'completed', 'goal_met', 'cancelled'))
);

ALTER TABLE email_automation_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage enrollments for their automations" ON email_automation_enrollments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM email_automations a JOIN sites s ON s.id = a.site_id
    WHERE a.id = email_automation_enrollments.automation_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Service role full access to enrollments" ON email_automation_enrollments
  FOR ALL USING (auth.role() = 'service_role');
