-- Category template inheritance (mirrors directory migrations 126 + 167):
-- templates own block structure, category rows store only block values.

-- 1. Create the category_templates table
CREATE TABLE IF NOT EXISTS category_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_category_templates_site ON category_templates (site_id);

DROP TRIGGER IF EXISTS update_category_templates_updated_at ON category_templates;
CREATE TRIGGER update_category_templates_updated_at
  BEFORE UPDATE ON category_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Seed a Blank template per site (default when the site has no default yet)
INSERT INTO category_templates (site_id, name, content_blocks, is_default, created_at, updated_at)
SELECT
  s.id,
  'Blank',
  '{}'::jsonb,
  NOT EXISTS (
    SELECT 1
    FROM category_templates existing_default
    WHERE existing_default.site_id = s.id
      AND existing_default.is_default = true
  ),
  now(),
  now()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1
  FROM category_templates existing_blank
  WHERE existing_blank.site_id = s.id
    AND existing_blank.name = 'Blank'
);

-- 3. Add template_id to categories and backfill before enforcing NOT NULL
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS template_id UUID;

UPDATE categories c
SET template_id = (
  SELECT ct.id
  FROM category_templates ct
  WHERE ct.site_id = c.site_id
  ORDER BY ct.is_default DESC, (ct.name = 'Blank') DESC, ct.updated_at DESC
  LIMIT 1
)
WHERE c.template_id IS NULL;

ALTER TABLE categories
  ALTER COLUMN template_id SET NOT NULL;

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_template_id_category_templates_id_fk;

ALTER TABLE categories
  ADD CONSTRAINT categories_template_id_category_templates_id_fk
  FOREIGN KEY (template_id)
  REFERENCES category_templates(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_categories_template
  ON categories (template_id);
