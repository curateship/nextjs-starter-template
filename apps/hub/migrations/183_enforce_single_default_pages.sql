WITH ranked_homepages AS (
  SELECT id,
    row_number() OVER (PARTITION BY site_id ORDER BY updated_at DESC, created_at DESC, id) AS homepage_number
  FROM pages
  WHERE is_homepage = true
)
UPDATE pages
SET is_homepage = false
FROM ranked_homepages
WHERE pages.id = ranked_homepages.id
  AND ranked_homepages.homepage_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_one_homepage_per_site
  ON pages (site_id)
  WHERE is_homepage = true;

WITH ranked_defaults AS (
  SELECT id,
    row_number() OVER (PARTITION BY site_id ORDER BY updated_at DESC, created_at DESC, id) AS default_number
  FROM site_dashboard_pages
  WHERE is_default = true
)
UPDATE site_dashboard_pages
SET is_default = false
FROM ranked_defaults
WHERE site_dashboard_pages.id = ranked_defaults.id
  AND ranked_defaults.default_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_pages_one_default_per_site
  ON site_dashboard_pages (site_id)
  WHERE is_default = true;
