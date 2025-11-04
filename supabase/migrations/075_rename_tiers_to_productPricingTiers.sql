-- Migration: Rename tiers to productPricingTiers in product-checkout blocks
-- This migration renames the tiers field to productPricingTiers for better naming clarity
-- Blocks affected: product-checkout

UPDATE products
SET content_blocks = (
  SELECT jsonb_object_agg(
    block_key,
    CASE
      WHEN block_key = '_settings' THEN block_value
      WHEN block_key = 'product-checkout' THEN (
        SELECT jsonb_object_agg(
          CASE
            WHEN key = 'tiers' THEN 'productPricingTiers'
            WHEN key = 'pricingTiers' THEN 'productPricingTiers'
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
    WHERE block_key = 'product-checkout'
      AND (
        block_value ? 'tiers' OR
        block_value ? 'pricingTiers'
      )
  );
