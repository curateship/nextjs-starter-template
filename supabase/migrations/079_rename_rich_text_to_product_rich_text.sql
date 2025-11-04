-- Migration: Rename rich-text to product-rich-text and update field names
-- This migration renames the rich text block type and its fields for consistency
-- Block type: rich-text → product-rich-text
-- Field: title → header
-- Field: subtitle → subheader
-- Field: content → richtextContent

-- Step 1: Rename the block type key from 'rich-text' to 'product-rich-text' in content_blocks JSONB
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    CASE
      WHEN block_key = 'rich-text' THEN 'product-rich-text'
      ELSE block_key
    END,
    block_value
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL
  AND content_blocks ? 'rich-text';

-- Step 2: Rename fields within product-rich-text blocks
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key = 'product-rich-text' THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'title' THEN 'header'
            WHEN key = 'subtitle' THEN 'subheader'
            WHEN key = 'content' THEN 'richtextContent'
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
    WHERE block_key = 'product-rich-text'
      AND (
        block_value ? 'title' OR
        block_value ? 'subtitle' OR
        block_value ? 'content'
      )
  );
