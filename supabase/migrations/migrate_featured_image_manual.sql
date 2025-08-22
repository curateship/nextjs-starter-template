-- MANUAL MIGRATION: Run this in Supabase SQL Editor
-- This migrates featured_image data to content_blocks and drops the column

-- First, let's see what we're working with
SELECT id, title, featured_image, content_blocks FROM products LIMIT 5;

-- Update all products to include featured_image in their product-default block
UPDATE products 
SET content_blocks = 
    CASE 
        -- If content_blocks already has product-default, update it with featured_image
        WHEN content_blocks ? 'product-default' THEN
            jsonb_set(
                content_blocks,
                '{product-default,featuredImage}',
                to_jsonb(COALESCE(featured_image::text, ''::text))
            )
        -- If no product-default block exists, create one with featured_image
        ELSE
            content_blocks || jsonb_build_object(
                'product-default',
                jsonb_build_object(
                    'title', title,
                    'richText', 'Add your product description here...',
                    'featuredImage', COALESCE(featured_image::text, ''::text),
                    'display_order', 0
                )
            )
    END
WHERE featured_image IS NOT NULL AND featured_image != '';

-- For products that don't have featured_image but should have it in their default block, ensure it's set to empty string
UPDATE products 
SET content_blocks = 
    CASE 
        -- If content_blocks already has product-default, ensure featuredImage is set
        WHEN content_blocks ? 'product-default' THEN
            CASE 
                WHEN content_blocks->'product-default' ? 'featuredImage' THEN content_blocks
                ELSE jsonb_set(
                    content_blocks,
                    '{product-default,featuredImage}',
                    to_jsonb(''::text)
                )
            END
        -- If no product-default block exists, create one
        ELSE
            content_blocks || jsonb_build_object(
                'product-default',
                jsonb_build_object(
                    'title', title,
                    'richText', 'Add your product description here...',
                    'featuredImage', ''::text,
                    'display_order', 0
                )
            )
    END
WHERE (featured_image IS NULL OR featured_image = '') 
  AND NOT (content_blocks->'product-default' ? 'featuredImage');

-- Verify the migration
SELECT id, title, featured_image, content_blocks->'product-default'->>'featuredImage' as migrated_featured_image FROM products LIMIT 5;

-- Finally, drop the featured_image column
ALTER TABLE products DROP COLUMN IF EXISTS featured_image;

-- Verify column is dropped
SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'featured_image';