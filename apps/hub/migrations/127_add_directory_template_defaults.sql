ALTER TABLE directory_templates
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

WITH ranked_templates AS (
  SELECT
    id,
    site_id,
    ROW_NUMBER() OVER (
      PARTITION BY site_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_num
  FROM directory_templates
)
UPDATE directory_templates
SET is_default = true
FROM ranked_templates
WHERE directory_templates.id = ranked_templates.id
  AND ranked_templates.row_num = 1
  AND NOT EXISTS (
    SELECT 1
    FROM directory_templates existing_templates
    WHERE existing_templates.site_id = directory_templates.site_id
      AND existing_templates.is_default = true
  );
