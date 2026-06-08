DO $$
BEGIN
IF EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'directory'
    AND column_name = 'directory_data'
) THEN
WITH core_source AS (
  SELECT
    d.id,
    core.block_id,
    COALESCE(d.content_blocks, '{}'::jsonb) AS blocks,
    COALESCE(d.content_blocks #> ARRAY[core.block_id, 'content'], '{}'::jsonb) AS content,
    d.directory_data->'fields' AS fields
  FROM directory d
  INNER JOIN directory_templates dt
    ON dt.id = d.template_id
    AND dt.site_id = d.site_id
  INNER JOIN LATERAL (
    SELECT COALESCE(block.value->>'id', block.key) AS block_id
    FROM jsonb_each(COALESCE(dt.content_blocks, '{}'::jsonb)) AS block(key, value)
    WHERE block.value->>'type' = 'directory-core'
    ORDER BY CASE
      WHEN block.value->>'display_order' ~ '^-?[0-9]+$' THEN (block.value->>'display_order')::int
      ELSE 0
    END
    LIMIT 1
  ) core ON true
  WHERE jsonb_typeof(d.directory_data->'fields') = 'object'
),
core_values AS (
  SELECT
    core_source.*,
    (
      SELECT jsonb_agg(item.link)
      FROM (
        SELECT jsonb_build_object(
          'id', 'core-menu-directions',
          'type', 'directions',
          'label', 'Get Directions',
          'value', COALESCE(NULLIF(fields->>'mapsUrl', ''), NULLIF(fields->>'address', '')),
          'icon', 'map'
        ) AS link
        WHERE COALESCE(NULLIF(fields->>'mapsUrl', ''), NULLIF(fields->>'address', '')) IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'core-menu-phone',
          'type', 'phone',
          'label', 'Phone',
          'value', fields->>'phone',
          'icon', 'phone'
        ) AS link
        WHERE NULLIF(fields->>'phone', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'core-menu-website',
          'type', 'website',
          'label', 'Website',
          'value', fields->>'website',
          'icon', 'site'
        ) AS link
        WHERE NULLIF(fields->>'website', '') IS NOT NULL
      ) item
    ) AS menu_links,
    (
      SELECT jsonb_agg(item.link)
      FROM (
        SELECT jsonb_build_object('id', 'core-social-instagram', 'platform', 'instagram', 'url', fields->>'instagram') AS link
        WHERE NULLIF(fields->>'instagram', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id', 'core-social-facebook', 'platform', 'facebook', 'url', fields->>'facebook') AS link
        WHERE NULLIF(fields->>'facebook', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id', 'core-social-tiktok', 'platform', 'tiktok', 'url', fields->>'tiktok') AS link
        WHERE NULLIF(fields->>'tiktok', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id', 'core-social-twitter', 'platform', 'twitter', 'url', fields->>'twitter') AS link
        WHERE NULLIF(fields->>'twitter', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id', 'core-social-linkedin', 'platform', 'linkedin', 'url', fields->>'linkedin') AS link
        WHERE NULLIF(fields->>'linkedin', '') IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id', 'core-social-youtube', 'platform', 'youtube', 'url', fields->>'youtube') AS link
        WHERE NULLIF(fields->>'youtube', '') IS NOT NULL
      ) item
    ) AS social_links
  FROM core_source
),
core_updates AS (
  SELECT
    id,
    jsonb_set(
      blocks,
      ARRAY[block_id],
      jsonb_strip_nulls(
        COALESCE(blocks->block_id, jsonb_build_object('id', block_id, 'type', 'directory-core', 'content', '{}'::jsonb)) ||
        jsonb_build_object(
          'id', block_id,
          'type', 'directory-core',
          'content', content || jsonb_strip_nulls(jsonb_build_object(
            'address', COALESCE(NULLIF(content->>'address', ''), NULLIF(fields->>'address', '')),
            'rating', CASE
              WHEN content ? 'rating' THEN content->'rating'
              WHEN fields->>'rating' ~ '^[0-9]+(\.[0-9]+)?$' THEN to_jsonb((fields->>'rating')::numeric)
              ELSE NULL
            END,
            'menuLinks', CASE
              WHEN jsonb_typeof(content->'menuLinks') = 'array' AND jsonb_array_length(content->'menuLinks') > 0 THEN content->'menuLinks'
              ELSE menu_links
            END,
            'socialLinks', CASE
              WHEN jsonb_typeof(content->'socialLinks') = 'array' AND jsonb_array_length(content->'socialLinks') > 0 THEN content->'socialLinks'
              ELSE social_links
            END
          ))
        )
      ),
      true
    ) AS content_blocks
  FROM core_values
)
UPDATE directory d
SET content_blocks = core_updates.content_blocks
FROM core_updates
WHERE d.id = core_updates.id;

WITH map_source AS (
  SELECT
    d.id,
    map_block.block_id,
    COALESCE(d.content_blocks, '{}'::jsonb) AS blocks,
    COALESCE(d.content_blocks #> ARRAY[map_block.block_id, 'content'], '{}'::jsonb) AS content,
    d.directory_data->'fields' AS fields
  FROM directory d
  INNER JOIN directory_templates dt
    ON dt.id = d.template_id
    AND dt.site_id = d.site_id
  INNER JOIN LATERAL (
    SELECT COALESCE(block.value->>'id', block.key) AS block_id
    FROM jsonb_each(COALESCE(dt.content_blocks, '{}'::jsonb)) AS block(key, value)
    WHERE block.value->>'type' = 'directory-google-map'
    ORDER BY CASE
      WHEN block.value->>'display_order' ~ '^-?[0-9]+$' THEN (block.value->>'display_order')::int
      ELSE 0
    END
    LIMIT 1
  ) map_block ON true
  WHERE jsonb_typeof(d.directory_data->'fields') = 'object'
),
map_updates AS (
  SELECT
    id,
    jsonb_set(
      blocks,
      ARRAY[block_id],
      jsonb_strip_nulls(
        COALESCE(blocks->block_id, jsonb_build_object('id', block_id, 'type', 'directory-google-map', 'content', '{}'::jsonb)) ||
        jsonb_build_object(
          'id', block_id,
          'type', 'directory-google-map',
          'content', content || jsonb_strip_nulls(jsonb_build_object(
            'locationQuery', COALESCE(NULLIF(content->>'locationQuery', ''), NULLIF(fields->>'mapsUrl', ''), NULLIF(fields->>'address', ''))
          ))
        )
      ),
      true
    ) AS content_blocks
  FROM map_source
)
UPDATE directory d
SET content_blocks = map_updates.content_blocks
FROM map_updates
WHERE d.id = map_updates.id;

ALTER TABLE directory
  DROP COLUMN directory_data;
END IF;
END;
$$;
