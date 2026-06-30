-- Post template inheritance:
-- templates own block structure/settings, post rows store only post values.

CREATE TABLE IF NOT EXISTS post_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_templates_site ON post_templates (site_id);

DROP TRIGGER IF EXISTS update_post_templates_updated_at ON post_templates;
CREATE TRIGGER update_post_templates_updated_at
  BEFORE UPDATE ON post_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO post_templates (site_id, name, content_blocks, is_default, created_at, updated_at)
SELECT
  s.id,
  'Blank',
  '{"post-core-default":{"id":"post-core-default","type":"core","display_order":0,"content":{"layoutColumn":"main","coreStyle":"default"}}}'::jsonb,
  NOT EXISTS (
    SELECT 1
    FROM post_templates existing_default
    WHERE existing_default.site_id = s.id
      AND existing_default.is_default = true
  ),
  now(),
  now()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1
  FROM post_templates existing_blank
  WHERE existing_blank.site_id = s.id
    AND existing_blank.name = 'Blank'
);

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS template_id UUID;

CREATE TEMP TABLE IF NOT EXISTS tmp_post_template_migration (
  post_id UUID PRIMARY KEY,
  template_id UUID NOT NULL
) ON COMMIT DROP;

TRUNCATE tmp_post_template_migration;

INSERT INTO tmp_post_template_migration (post_id, template_id)
SELECT p.id, gen_random_uuid()
FROM posts p
WHERE p.template_id IS NULL;

WITH source_posts AS (
  SELECT p.id, p.content_blocks
  FROM posts p
  INNER JOIN tmp_post_template_migration migration
    ON migration.post_id = p.id
),
template_blocks AS (
  SELECT
    source_posts.id,
    COALESCE(
      jsonb_object_agg(entry.key, sanitized.block) FILTER (WHERE sanitized.block IS NOT NULL),
      '{}'::jsonb
    ) AS content_blocks
  FROM source_posts
  LEFT JOIN LATERAL jsonb_each(COALESCE(source_posts.content_blocks, '{}'::jsonb)) AS entry(key, value) ON true
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN entry.value->>'type' = 'core' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'core',
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'coreStyle', entry.value#>'{content,coreStyle}',
            'styleConfig', entry.value#>'{content,styleConfig}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        WHEN entry.value->>'type' = 'related-posts' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'related-posts',
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'title', entry.value#>'{content,title}',
            'subtitle', entry.value#>'{content,subtitle}',
            'displayMode', entry.value#>'{content,displayMode}',
            'columns', entry.value#>'{content,columns}',
            'itemsToShow', entry.value#>'{content,itemsToShow}',
            'sortBy', entry.value#>'{content,sortBy}',
            'sortOrder', entry.value#>'{content,sortOrder}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        WHEN entry.value->>'type' = 'table-of-contents' THEN jsonb_strip_nulls(jsonb_build_object(
          'id', COALESCE(entry.value->>'id', entry.key),
          'type', 'table-of-contents',
          'display_order', entry.value->'display_order',
          'content', jsonb_strip_nulls(jsonb_build_object(
            'layoutColumn', entry.value#>'{content,layoutColumn}',
            'title', entry.value#>'{content,title}',
            'sticky', entry.value#>'{content,sticky}',
            'headingLevel', entry.value#>'{content,headingLevel}',
            'visibility', entry.value#>'{content,visibility}'
          ))
        ))
        ELSE NULL
      END AS block
  ) sanitized
  GROUP BY source_posts.id
)
INSERT INTO post_templates (id, site_id, name, content_blocks, is_default, created_at, updated_at)
SELECT
  migration.template_id,
  p.site_id,
  LEFT(CONCAT('Migrated: ', p.title), 255),
  template_blocks.content_blocks,
  false,
  now(),
  now()
FROM tmp_post_template_migration migration
INNER JOIN posts p
  ON p.id = migration.post_id
INNER JOIN template_blocks
  ON template_blocks.id = p.id;

WITH source_posts AS (
  SELECT p.id, p.content_blocks
  FROM posts p
  INNER JOIN tmp_post_template_migration migration
    ON migration.post_id = p.id
),
value_entries AS (
  SELECT
    source_posts.id,
    entry.key,
    CASE
      WHEN entry.value->>'type' = 'core' THEN (
        WITH value_content AS (
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'body', to_jsonb(NULLIF(entry.value#>>'{content,body}', '')),
            'text', to_jsonb(NULLIF(entry.value#>>'{content,text}', '')),
            'format', to_jsonb(NULLIF(entry.value#>>'{content,format}', ''))
          )) AS content
        )
        SELECT CASE
          WHEN value_content.content = '{}'::jsonb THEN NULL
          ELSE jsonb_build_object(
            'id', COALESCE(entry.value->>'id', entry.key),
            'type', 'core',
            'content', value_content.content
          )
        END
        FROM value_content
      )
      WHEN jsonb_typeof(entry.value) = 'object' AND entry.value ? 'type' THEN NULL
      ELSE entry.value
    END AS value
  FROM source_posts
  LEFT JOIN LATERAL jsonb_each(COALESCE(source_posts.content_blocks, '{}'::jsonb)) AS entry(key, value) ON true
),
value_blocks AS (
  SELECT
    value_entries.id,
    COALESCE(
      jsonb_object_agg(value_entries.key, value_entries.value) FILTER (WHERE value_entries.value IS NOT NULL),
      '{}'::jsonb
    ) AS content_blocks
  FROM value_entries
  GROUP BY value_entries.id
)
UPDATE posts p
SET
  template_id = migration.template_id,
  content_blocks = value_blocks.content_blocks,
  updated_at = now()
FROM tmp_post_template_migration migration
INNER JOIN value_blocks
  ON value_blocks.id = migration.post_id
WHERE p.id = migration.post_id;

UPDATE posts p
SET template_id = (
  SELECT pt.id
  FROM post_templates pt
  WHERE pt.site_id = p.site_id
  ORDER BY pt.is_default DESC, (pt.name = 'Blank') DESC, pt.updated_at DESC
  LIMIT 1
)
WHERE p.template_id IS NULL;

ALTER TABLE posts
  ALTER COLUMN template_id SET NOT NULL;

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_template_id_post_templates_id_fk;

ALTER TABLE posts
  ADD CONSTRAINT posts_template_id_post_templates_id_fk
  FOREIGN KEY (template_id)
  REFERENCES post_templates(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_posts_template
  ON posts (template_id);
