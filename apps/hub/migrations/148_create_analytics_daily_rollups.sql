CREATE TABLE IF NOT EXISTS analytics_daily_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  content_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT,
  content_slug TEXT,
  page_path TEXT,
  event_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_events_unique
  ON analytics_daily_events (site_id, day, content_key, event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_events_site_day
  ON analytics_daily_events (site_id, day);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_events_content
  ON analytics_daily_events (site_id, content_type, content_id, day);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_events_path
  ON analytics_daily_events (site_id, page_path, day);

CREATE TABLE IF NOT EXISTS analytics_daily_visitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  content_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT,
  content_slug TEXT,
  page_path TEXT,
  visitor_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_visitors_unique
  ON analytics_daily_visitors (site_id, day, content_key, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_visitors_site_day
  ON analytics_daily_visitors (site_id, day);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_visitors_content
  ON analytics_daily_visitors (site_id, content_type, content_id, day);

INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Analytics Rollups', '/api/cron/analytics-rollups', '0 * * * *', true
WHERE NOT EXISTS (
  SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/analytics-rollups'
);
