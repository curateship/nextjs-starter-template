ALTER TABLE category_relationships
ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

WITH ranked_relationships AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY content_id, content_type
      ORDER BY created_at ASC, id ASC
    ) AS row_number
  FROM category_relationships
)
UPDATE category_relationships
SET is_primary = ranked_relationships.row_number = 1
FROM ranked_relationships
WHERE category_relationships.id = ranked_relationships.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccr_primary_content
ON category_relationships (content_id, content_type)
WHERE is_primary = true;
