-- MANUAL MIGRATION: Run this in Supabase SQL Editor
-- This migrates rich_text data to content_blocks and drops the column

-- First, let's see what we're working with
SELECT id, title, rich_text, content_blocks FROM products LIMIT 5;

-- Migrate existing rich_text data to content_blocks
UPDATE products 
SET content_blocks = 
    CASE 
        -- If content_blocks already has product-default, update it with rich_text
        WHEN content_blocks ? 'product-default' THEN
            jsonb_set(
                content_blocks,
                '{product-default,richText}',
                to_jsonb(COALESCE(rich_text, 'Add your product description here...'))
            )
        -- If no product-default block exists, create one with rich_text
        ELSE
            content_blocks || jsonb_build_object(
                'product-default',
                jsonb_build_object(
                    'title', title,
                    'richText', COALESCE(rich_text, 'Add your product description here...'),
                    'featuredImage', COALESCE(featured_image, ''),
                    'display_order', 0
                )
            )
    END
WHERE rich_text IS NOT NULL AND rich_text != '';

-- For products that don't have rich_text but should have a default block, create one
UPDATE products 
SET content_blocks = 
    content_blocks || jsonb_build_object(
        'product-default',
        jsonb_build_object(
            'title', title,
            'richText', 'Add your product description here...',
            'featuredImage', COALESCE(featured_image, ''),
            'display_order', 0
        )
    )
WHERE NOT (content_blocks ? 'product-default');

-- Verify the migration
SELECT id, title, content_blocks->'product-default'->>'richText' as migrated_rich_text FROM products LIMIT 5;

-- Finally, drop the rich_text column
ALTER TABLE products DROP COLUMN IF EXISTS rich_text;

-- Verify column is dropped
SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rich_text';