-- Analytics events table (unified: pageviews, clicks, form submits, custom events)
CREATE TABLE analytics_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL,
  visitor_hash    TEXT,
  event_type      TEXT NOT NULL,
  page_path       TEXT,
  referrer        TEXT,
  referrer_domain TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  device_type     TEXT,
  browser         TEXT,
  country         TEXT,
  event_data      JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_events_site_created ON analytics_events (site_id, created_at DESC);
CREATE INDEX idx_analytics_events_site_type_created ON analytics_events (site_id, event_type, created_at DESC);
CREATE INDEX idx_analytics_events_site_session ON analytics_events (site_id, session_id);
CREATE INDEX idx_analytics_events_site_page_created ON analytics_events (site_id, page_path, created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON analytics_events
  FOR ALL USING (auth.role() = 'service_role');

-- Analytics sessions table (pre-computed session summaries)
CREATE TABLE analytics_sessions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL,
  visitor_hash      TEXT,
  entry_page        TEXT,
  exit_page         TEXT,
  page_count        INTEGER DEFAULT 1,
  duration_seconds  INTEGER DEFAULT 0,
  referrer_domain   TEXT,
  utm_source        TEXT,
  device_type       TEXT,
  is_bounce         BOOLEAN DEFAULT true,
  started_at        TIMESTAMPTZ DEFAULT now(),
  ended_at          TIMESTAMPTZ
);

CREATE INDEX idx_analytics_sessions_site_started ON analytics_sessions (site_id, started_at DESC);
CREATE INDEX idx_analytics_sessions_site_referrer ON analytics_sessions (site_id, referrer_domain);

ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON analytics_sessions
  FOR ALL USING (auth.role() = 'service_role');
