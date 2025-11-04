-- Migration: Rename faq to product-faq and faqItems to productFaqItems
-- This migration renames the FAQ block type and its items field for consistency
-- Blocks affected: faq → product-faq

-- Step 1: Rename the block type key from 'faq' to 'product-faq' in content_blocks JSONB
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    CASE
      WHEN block_key = 'faq' THEN 'product-faq'
      ELSE block_key
    END,
    block_value
  )
  FROM jsonb_each(content_blocks) AS blocks(block_key, block_value)
)
WHERE content_blocks IS NOT NULL
  AND content_blocks ? 'faq';

-- Step 2: Rename faqItems to productFaqItems and also handle header/subheader within product-faq blocks
UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key = 'product-faq' THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'faqItems' THEN 'productFaqItems'
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
    WHERE block_key = 'product-faq'
      AND (
        block_value ? 'faqItems' OR
        block_value ? 'title' OR
        block_value ? 'subtitle'
      )
  );
