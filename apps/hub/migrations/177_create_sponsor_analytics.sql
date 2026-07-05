CREATE TABLE IF NOT EXISTS sponsor_daily_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  placement VARCHAR(64) NOT NULL DEFAULT 'post_editor',
  source_path TEXT NOT NULL DEFAULT '/',
  post_id UUID,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_daily_analytics_unique
  ON sponsor_daily_analytics(sponsor_id, day, placement, source_path);
CREATE INDEX IF NOT EXISTS idx_sponsor_daily_analytics_sponsor_day
  ON sponsor_daily_analytics(sponsor_id, day);
CREATE INDEX IF NOT EXISTS idx_sponsor_daily_analytics_site_day
  ON sponsor_daily_analytics(site_id, day);

CREATE TABLE IF NOT EXISTS sponsor_portal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_portal_links_token_hash
  ON sponsor_portal_links(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_portal_links_sponsor
  ON sponsor_portal_links(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_portal_links_site
  ON sponsor_portal_links(site_id);
