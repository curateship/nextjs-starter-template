ALTER TABLE analytics_daily_stats
  ADD COLUMN IF NOT EXISTS unique_visitors INTEGER NOT NULL DEFAULT 0;

WITH daily_visitors AS (
  SELECT
    site_id,
    day,
    COUNT(*)::int AS unique_visitors
  FROM analytics_daily_site_visitors
  GROUP BY site_id, day
)
UPDATE analytics_daily_stats stats
SET
  unique_visitors = daily_visitors.unique_visitors,
  updated_at = now()
FROM daily_visitors
WHERE stats.site_id = daily_visitors.site_id
  AND stats.day = daily_visitors.day;

DROP TABLE IF EXISTS analytics_daily_site_visitors;
