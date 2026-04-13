CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE directory
ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

UPDATE directory
SET is_private = COALESCE((content_blocks -> '_settings' ->> 'is_private')::boolean, false)
WHERE is_private = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_site_display_created
ON directory (site_id, display_order, created_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_site_publish_private
ON directory (site_id, is_published, is_private, display_order, created_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_site_updated
ON directory (site_id, updated_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_site_title_lower
ON directory (site_id, lower(title), id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_search_trgm
ON directory
USING gin (
  lower(
    coalesce(title, '') || ' ' ||
    coalesce(slug, '') || ' ' ||
    coalesce(description, '')
  ) gin_trgm_ops
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ccr_category_content
ON category_relationships (category_id, content_type, content_id);
