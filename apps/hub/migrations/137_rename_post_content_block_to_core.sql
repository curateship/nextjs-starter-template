-- Rename the post builder Core block from the old post-content identity.

CREATE OR REPLACE FUNCTION rename_post_content_blocks_to_core(blocks JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  block_key TEXT;
  block_value JSONB;
  next_key TEXT;
  next_value JSONB;
  content_value JSONB;
BEGIN
  FOR block_key, block_value IN
    SELECT key, value FROM jsonb_each(COALESCE(blocks, '{}'::jsonb))
  LOOP
    next_key := replace(block_key, 'post-content', 'core');
    next_value := block_value;

    IF jsonb_typeof(block_value) = 'object' THEN
      IF block_value->>'type' = 'post-content' THEN
        next_value := jsonb_set(next_value, '{type}', '"core"'::jsonb, true);
      END IF;

      IF next_value ? 'id' THEN
        next_value := jsonb_set(
          next_value,
          '{id}',
          to_jsonb(replace(next_value->>'id', 'post-content', 'core')),
          true
        );
      END IF;

      content_value := next_value->'content';
      IF jsonb_typeof(content_value) = 'object' AND content_value ? 'postContentStyle' THEN
        content_value := (content_value - 'postContentStyle')
          || jsonb_build_object('coreStyle', content_value->'postContentStyle');
        next_value := jsonb_set(next_value, '{content}', content_value, true);
      END IF;
    END IF;

    result := result || jsonb_build_object(next_key, next_value);
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

UPDATE posts
SET content_blocks = rename_post_content_blocks_to_core(content_blocks)
WHERE content_blocks::text LIKE '%post-content%'
   OR content_blocks::text LIKE '%postContentStyle%';

UPDATE post_templates
SET content_blocks = rename_post_content_blocks_to_core(content_blocks)
WHERE content_blocks::text LIKE '%post-content%'
   OR content_blocks::text LIKE '%postContentStyle%';

UPDATE sites
SET settings = jsonb_set(
  settings,
  '{default_blocks,posts}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item.value = '"post-content"'::jsonb THEN '"core"'::jsonb
        ELSE item.value
      END
    )
    FROM jsonb_array_elements(settings #> '{default_blocks,posts}') AS item(value)
  ),
  true
)
WHERE jsonb_typeof(settings #> '{default_blocks,posts}') = 'array'
  AND (settings #> '{default_blocks,posts}') @> '["post-content"]'::jsonb;

DROP FUNCTION rename_post_content_blocks_to_core(JSONB);
