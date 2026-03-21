-- Migration: Rename lead-magnet to product-lead-magnet and update field names
-- This migration renames the lead magnet block type and its fields for consistency
-- Block type: lead-magnet → product-lead-magnet
-- Field: benefits → productBenefits
-- Field: thankYou → thankYouMessage

-- Step 1: Rename the block type key from 'lead-magnet' to 'product-lead-magnet' in content_blocks JSONB
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    CASE
      WHEN block_key = 'lead-magnet' THEN 'product-lead-magnet'
      ELSE block_key
    END,
    block_value
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL
  AND content_blocks ? 'lead-magnet';

-- Step 2: Rename fields within product-lead-magnet blocks
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key = 'product-lead-magnet' THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'benefits' THEN 'productBenefits'
            WHEN key = 'thankYou' THEN 'thankYouMessage'
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
    WHERE block_key = 'product-lead-magnet'
      AND (
        block_value ? 'benefits' OR
        block_value ? 'thankYou'
      )
  );
