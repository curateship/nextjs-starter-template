DO $$
BEGIN
  CREATE TYPE directory_status_enum AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE directory
ADD COLUMN IF NOT EXISTS status directory_status_enum NOT NULL DEFAULT 'draft';

UPDATE directory
SET status = CASE
  WHEN COALESCE(is_published, false) = true AND COALESCE(is_private, false) = false THEN 'published'::directory_status_enum
  ELSE 'draft'::directory_status_enum
END;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_directories_site_status
ON directory (site_id, status, display_order, created_at DESC, id);

DROP INDEX CONCURRENTLY IF EXISTS idx_directories_site_publish_private;
