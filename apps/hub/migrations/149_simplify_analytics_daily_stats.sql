CREATE TABLE IF NOT EXISTS analytics_daily_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  pages JSONB NOT NULL DEFAULT '{}'::jsonb,
  referrers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_stats_unique
  ON analytics_daily_stats (site_id, day);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_stats_site_day
  ON analytics_daily_stats (site_id, day);

CREATE TABLE IF NOT EXISTS analytics_daily_site_visitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_site_visitors_unique
  ON analytics_daily_site_visitors (site_id, day, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_site_visitors_site_day
  ON analytics_daily_site_visitors (site_id, day);

WITH daily_pageviews AS (
  SELECT
    site_id,
    (created_at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*)::int AS page_views
  FROM analytics_events
  WHERE event_type = 'pageview'
  GROUP BY site_id, (created_at AT TIME ZONE 'UTC')::date
),
page_counts AS (
  SELECT
    site_id,
    day,
    jsonb_object_agg(page_path, views) AS pages
  FROM (
    SELECT
      site_id,
      (created_at AT TIME ZONE 'UTC')::date AS day,
      COALESCE(NULLIF(page_path, ''), '/') AS page_path,
      COUNT(*)::int AS views
    FROM analytics_events
    WHERE event_type = 'pageview'
    GROUP BY site_id, (created_at AT TIME ZONE 'UTC')::date, COALESCE(NULLIF(page_path, ''), '/')
  ) grouped_pages
  GROUP BY site_id, day
),
referrer_counts AS (
  SELECT
    site_id,
    day,
    jsonb_object_agg(referrer_domain, visits) AS referrers
  FROM (
    SELECT
      site_id,
      (created_at AT TIME ZONE 'UTC')::date AS day,
      referrer_domain,
      COUNT(*)::int AS visits
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND referrer_domain IS NOT NULL
      AND referrer_domain <> ''
    GROUP BY site_id, (created_at AT TIME ZONE 'UTC')::date, referrer_domain
  ) grouped_referrers
  GROUP BY site_id, day
)
INSERT INTO analytics_daily_stats (
  site_id,
  day,
  page_views,
  pages,
  referrers,
  created_at,
  updated_at
)
SELECT
  daily_pageviews.site_id,
  daily_pageviews.day,
  daily_pageviews.page_views,
  COALESCE(page_counts.pages, '{}'::jsonb),
  COALESCE(referrer_counts.referrers, '{}'::jsonb),
  now(),
  now()
FROM daily_pageviews
LEFT JOIN page_counts
  ON page_counts.site_id = daily_pageviews.site_id
  AND page_counts.day = daily_pageviews.day
LEFT JOIN referrer_counts
  ON referrer_counts.site_id = daily_pageviews.site_id
  AND referrer_counts.day = daily_pageviews.day
ON CONFLICT (site_id, day) DO UPDATE SET
  page_views = EXCLUDED.page_views,
  pages = EXCLUDED.pages,
  referrers = EXCLUDED.referrers,
  updated_at = now();

INSERT INTO analytics_daily_site_visitors (site_id, day, visitor_hash, created_at)
SELECT DISTINCT
  site_id,
  (created_at AT TIME ZONE 'UTC')::date AS day,
  visitor_hash,
  now()
FROM analytics_events
WHERE event_type = 'pageview'
  AND visitor_hash IS NOT NULL
  AND visitor_hash <> ''
ON CONFLICT (site_id, day, visitor_hash) DO NOTHING;

DELETE FROM cron_jobs
WHERE endpoint = '/api/cron/analytics-rollups';

DROP FUNCTION IF EXISTS get_analytics_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_top_pages(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT);
DROP FUNCTION IF EXISTS get_top_referrers(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT);
DROP FUNCTION IF EXISTS get_traffic_over_time(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN);
DROP FUNCTION IF EXISTS get_user_journeys(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT);

DROP TABLE IF EXISTS analytics_daily_visitors;
DROP TABLE IF EXISTS analytics_daily_events;
DROP TABLE IF EXISTS analytics_sessions;
DROP TABLE IF EXISTS analytics_events;
