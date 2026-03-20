-- RPC functions for analytics dashboard (aggregation server-side instead of fetching all rows)

-- Overview stats: pageviews, unique visitors, bounce rate, avg duration
CREATE OR REPLACE FUNCTION get_analytics_overview(
  p_site_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSON AS $$
DECLARE
  v_page_views BIGINT;
  v_unique_visitors BIGINT;
  v_total_sessions BIGINT;
  v_bounces BIGINT;
  v_avg_duration NUMERIC;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT visitor_hash)
  INTO v_page_views, v_unique_visitors
  FROM analytics_events
  WHERE site_id = p_site_id
    AND event_type = 'pageview'
    AND created_at >= p_from
    AND created_at <= p_to;

  SELECT COUNT(*),
         COALESCE(SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END), 0),
         COALESCE(AVG(duration_seconds), 0)
  INTO v_total_sessions, v_bounces, v_avg_duration
  FROM analytics_sessions
  WHERE site_id = p_site_id
    AND started_at >= p_from
    AND started_at <= p_to;

  RETURN json_build_object(
    'pageViews', COALESCE(v_page_views, 0),
    'uniqueVisitors', COALESCE(v_unique_visitors, 0),
    'bounceRate', CASE WHEN v_total_sessions > 0
      THEN ROUND((v_bounces::NUMERIC / v_total_sessions) * 100)
      ELSE 0 END,
    'avgDuration', CASE WHEN v_total_sessions > 0
      THEN ROUND(v_avg_duration)
      ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Top pages by view count
CREATE OR REPLACE FUNCTION get_top_pages(
  p_site_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS JSON AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT page_path AS path, COUNT(*) AS views
      FROM analytics_events
      WHERE site_id = p_site_id
        AND event_type = 'pageview'
        AND created_at >= p_from
        AND created_at <= p_to
        AND page_path IS NOT NULL
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT p_limit
    ) t
  ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Top referrers by visit count
CREATE OR REPLACE FUNCTION get_top_referrers(
  p_site_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS JSON AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT referrer_domain AS domain, COUNT(*) AS visits
      FROM analytics_events
      WHERE site_id = p_site_id
        AND event_type = 'pageview'
        AND created_at >= p_from
        AND created_at <= p_to
        AND referrer_domain IS NOT NULL
      GROUP BY referrer_domain
      ORDER BY visits DESC
      LIMIT p_limit
    ) t
  ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Traffic over time (daily or hourly buckets)
CREATE OR REPLACE FUNCTION get_traffic_over_time(
  p_site_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_hourly BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        CASE WHEN p_hourly
          THEN to_char(bucket, 'Mon DD HH24:00')
          ELSE to_char(bucket, 'Mon DD')
        END AS date,
        views,
        visitors
      FROM (
        SELECT
          CASE WHEN p_hourly
            THEN date_trunc('hour', created_at)
            ELSE date_trunc('day', created_at)
          END AS bucket,
          COUNT(*) AS views,
          COUNT(DISTINCT visitor_hash) AS visitors
        FROM analytics_events
        WHERE site_id = p_site_id
          AND event_type = 'pageview'
          AND created_at >= p_from
          AND created_at <= p_to
        GROUP BY bucket
        ORDER BY bucket ASC
      ) bucketed
    ) t
  ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User journeys (entry → exit patterns)
CREATE OR REPLACE FUNCTION get_user_journeys(
  p_site_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS JSON AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        COALESCE(entry_page, '/') || ' → ' || COALESCE(exit_page, '/') AS path,
        COUNT(*) AS count
      FROM analytics_sessions
      WHERE site_id = p_site_id
        AND started_at >= p_from
        AND started_at <= p_to
        AND page_count > 1
      GROUP BY entry_page, exit_page
      ORDER BY count DESC
      LIMIT p_limit
    ) t
  ), '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
