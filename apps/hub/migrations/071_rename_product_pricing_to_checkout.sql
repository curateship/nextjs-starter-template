-- Rename product-pricing block type to product-checkout
-- This migration updates existing data in the products.content_blocks JSONB column
-- Products store blocks as JSON: { "product-pricing": {...}, "product-hero": {...} }

-- Step 1: Rename product-pricing to product-checkout in all products' content_blocks
UPDATE products
SET content_blocks = (
  -- Remove the old product-pricing key and add product-checkout with the same content
  CASE
    WHEN content_blocks ? 'product-pricing' THEN
      (content_blocks - 'product-pricing') ||
      jsonb_build_object('product-checkout', content_blocks->'product-pricing')
    ELSE
      content_blocks
  END
)
WHERE content_blocks ? 'product-pricing';

-- Step 2: No constraint to update - products use JSONB which doesn't have block type constraints
-- The constraint validation happens in the application layer
