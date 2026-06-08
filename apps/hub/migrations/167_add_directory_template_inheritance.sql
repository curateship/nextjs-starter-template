INSERT INTO directory_templates (site_id, name, content_blocks, is_default, created_at, updated_at)
SELECT
  s.id,
  'Blank',
  '{}'::jsonb,
  NOT EXISTS (
    SELECT 1
    FROM directory_templates existing_default
    WHERE existing_default.site_id = s.id
      AND existing_default.is_default = true
  ),
  now(),
  now()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1
  FROM directory_templates existing_blank
  WHERE existing_blank.site_id = s.id
    AND existing_blank.name = 'Blank'
);

ALTER TABLE directory
  ADD COLUMN IF NOT EXISTS template_id UUID;

UPDATE directory d
SET template_id = (
  SELECT dt.id
  FROM directory_templates dt
  WHERE dt.site_id = d.site_id
  ORDER BY dt.is_default DESC, (dt.name = 'Blank') DESC, dt.updated_at DESC
  LIMIT 1
)
WHERE d.template_id IS NULL;

ALTER TABLE directory
  ALTER COLUMN template_id SET NOT NULL;

ALTER TABLE directory
  DROP CONSTRAINT IF EXISTS directory_template_id_directory_templates_id_fk;

ALTER TABLE directory
  ADD CONSTRAINT directory_template_id_directory_templates_id_fk
  FOREIGN KEY (template_id)
  REFERENCES directory_templates(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_directories_template
  ON directory (template_id);
