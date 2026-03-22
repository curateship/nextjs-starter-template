-- Newsletter skills: batch AI newsletter generation
CREATE TABLE newsletter_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  reference_text TEXT,
  settings JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_newsletter_skills_site ON newsletter_skills(site_id);

-- Newsletter skill outputs: generated newsletters pending review
CREATE TABLE newsletter_skill_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES newsletter_skills(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  content_blocks JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  newsletter_id UUID REFERENCES newsletters(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_newsletter_skill_outputs_skill ON newsletter_skill_outputs(skill_id);
CREATE INDEX idx_newsletter_skill_outputs_site ON newsletter_skill_outputs(site_id);
CREATE INDEX idx_newsletter_skill_outputs_status ON newsletter_skill_outputs(skill_id, status);
