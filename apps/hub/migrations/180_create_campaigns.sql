CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  type varchar(20) NOT NULL CONSTRAINT campaigns_type_check CHECK (type IN ('bar', 'popup')),
  content jsonb NOT NULL,
  targeting jsonb NOT NULL,
  trigger jsonb NOT NULL,
  frequency varchar(30) NOT NULL CONSTRAINT campaigns_frequency_check CHECK (frequency IN ('once_per_visitor', 'once_per_session', 'every_visit')),
  starts_at timestamptz,
  ends_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'draft' CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'active')),
  views integer NOT NULL DEFAULT 0,
  dismissals integer NOT NULL DEFAULT 0,
  submissions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_schedule_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_campaigns_site_status ON campaigns(site_id, status);
CREATE INDEX idx_campaigns_site_created ON campaigns(site_id, created_at);
