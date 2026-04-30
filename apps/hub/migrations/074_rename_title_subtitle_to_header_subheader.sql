-- Migration: Rename title/subtitle to header/subheader in product blocks
-- This migration renames field names in content_blocks JSONB for consistency
-- Blocks affected: faq, product-hotspot, listing-views
-- Note: product-checkout and product-features already use header/subheader from migration 073

UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key IN ('faq', 'product-hotspot', 'listing-views') THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'title' THEN 'header'
            WHEN key = 'subtitle' THEN 'subheader'
            ELSE key
          END,
          value
        )
        FROM jsonb_each(block_value)
      )
      ELSE block_value
    END
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
    WHERE block_key IN ('faq', 'product-hotspot', 'listing-views')
      AND (
        block_value ? 'title' OR
        block_value ? 'subtitle'
      )
  );
