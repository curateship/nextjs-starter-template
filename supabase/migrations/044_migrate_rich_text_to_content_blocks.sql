-- Migrate rich_text column to content_blocks JSON structure
-- This migration moves rich_text data into the product-default block within content_blocks

-- First, update existing products that have rich_text data
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

-- Now drop the rich_text column as it's been migrated to JSON
ALTER TABLE products DROP COLUMN IF EXISTS rich_text;