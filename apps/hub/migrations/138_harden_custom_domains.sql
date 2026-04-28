-- Enforce one active custom-domain assignment per site.
-- Blank legacy values are normalized so the partial unique index can be applied safely.

UPDATE sites
SET custom_domain = NULL
WHERE custom_domain = '';

WITH ranked_domains AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY custom_domain
      ORDER BY created_at NULLS LAST, id
    ) AS domain_rank
  FROM sites
  WHERE custom_domain IS NOT NULL
)
UPDATE sites
SET custom_domain = NULL
FROM ranked_domains
WHERE sites.id = ranked_domains.id
  AND ranked_domains.domain_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_custom_domain_unique
  ON sites(custom_domain)
  WHERE custom_domain IS NOT NULL AND custom_domain <> '';
