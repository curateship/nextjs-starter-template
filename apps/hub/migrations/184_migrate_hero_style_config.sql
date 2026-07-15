CREATE FUNCTION pg_temp.migrate_hero_style_block(block jsonb, style_fields text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH source AS (
    SELECT
      COALESCE(block->'content', '{}'::jsonb) AS content,
      COALESCE(NULLIF(block->'content'->>'heroStyle', ''), 'default') AS style_name
  ), migrated AS (
    SELECT
      content,
      style_name,
      COALESCE((
        SELECT jsonb_object_agg(entry.key, entry.value)
        FROM jsonb_each(content) AS entry
        WHERE entry.key = ANY(style_fields)
      ), '{}'::jsonb) AS legacy_style,
      CASE
        WHEN jsonb_typeof(content->'styleConfig') = 'object' THEN content->'styleConfig'
        ELSE '{}'::jsonb
      END AS style_config
    FROM source
  )
  SELECT jsonb_set(
    block,
    '{content}',
    (content - style_fields)
      || jsonb_build_object('heroStyle', style_name)
      || jsonb_build_object(
        'styleConfig',
        style_config || jsonb_build_object(
          style_name,
          legacy_style || COALESCE(style_config->style_name, '{}'::jsonb)
        )
      ),
    true
  )
  FROM migrated
$$;

UPDATE pages
SET content_blocks = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE WHEN entry.value->>'type' = 'hero'
      THEN pg_temp.migrate_hero_style_block(entry.value, ARRAY[
        'heroImage', 'showHeroImage', 'showRainbowButton', 'rainbowButtonText',
        'rainbowButtonIcon', 'githubLink', 'showParticles', 'trustedByText',
        'trustedByCount', 'trustedByAvatars', 'backgroundPattern',
        'backgroundPatternSize', 'backgroundPatternOpacity', 'backgroundColor',
        'backgroundCustomColor', 'backgroundMutedShade', 'showTrustedByBadge',
        'extendBackgroundUnderNavigation'
      ])
      ELSE entry.value
    END
  ) AS blocks
  FROM jsonb_each(COALESCE(pages.content_blocks, '{}'::jsonb)) AS entry
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(COALESCE(pages.content_blocks, '{}'::jsonb)) AS entry
  WHERE entry.value->>'type' = 'hero'
);

UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE WHEN entry.value->>'type' = 'product-hero'
      THEN pg_temp.migrate_hero_style_block(entry.value, ARRAY[
        'heroImage', 'showHeroImage', 'showParticles', 'trustedByText',
        'trustedByCount', 'trustedByAvatars', 'backgroundPattern',
        'backgroundPatternSize', 'backgroundPatternOpacity', 'showTrustedByBadge'
      ])
      ELSE entry.value
    END
  ) AS blocks
  FROM jsonb_each(COALESCE(products.content_blocks, '{}'::jsonb)) AS entry
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(COALESCE(products.content_blocks, '{}'::jsonb)) AS entry
  WHERE entry.value->>'type' = 'product-hero'
);

UPDATE product_templates
SET content_blocks = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE WHEN entry.value->>'type' = 'product-hero'
      THEN pg_temp.migrate_hero_style_block(entry.value, ARRAY[
        'heroImage', 'showHeroImage', 'showParticles', 'trustedByText',
        'trustedByCount', 'trustedByAvatars', 'backgroundPattern',
        'backgroundPatternSize', 'backgroundPatternOpacity', 'showTrustedByBadge'
      ])
      ELSE entry.value
    END
  ) AS blocks
  FROM jsonb_each(COALESCE(product_templates.content_blocks, '{}'::jsonb)) AS entry
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_each(COALESCE(product_templates.content_blocks, '{}'::jsonb)) AS entry
  WHERE entry.value->>'type' = 'product-hero'
);
