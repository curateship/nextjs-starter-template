-- Rename headerTitle to header, headerSubtitle to subheader, and features to featuresCollection
-- This ensures proper JSONB key ordering (by length: header(6), subheader(9), headerAlign(11), display_order(13), featuresCollection(18))

-- Update all product blocks to use new naming convention
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      ELSE (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'headerTitle' THEN 'header'
            WHEN key = 'headerSubtitle' THEN 'subheader'
            WHEN key = 'features' THEN 'featuresCollection'
            ELSE key
          END,
          value
        )
        FROM jsonb_each(block_value)
      )
    END
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL;
