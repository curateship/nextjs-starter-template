ALTER TABLE IF EXISTS analytics_daily_stats
  RENAME TO analytic_daily_visitors;

ALTER INDEX IF EXISTS idx_analytics_daily_stats_unique
  RENAME TO idx_analytic_daily_visitors_unique;

ALTER INDEX IF EXISTS idx_analytics_daily_stats_site_day
  RENAME TO idx_analytic_daily_visitors_site_day;
