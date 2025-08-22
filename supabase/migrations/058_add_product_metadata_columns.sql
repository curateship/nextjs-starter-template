-- Add featured_image and description columns to products table
ALTER TABLE products
ADD COLUMN featured_image TEXT,
ADD COLUMN description TEXT;

-- Migrate existing data from content_blocks to new columns
UPDATE products
SET 
  featured_image = content_blocks->'product-default'->>'featuredImage',
  description = content_blocks->'product-default'->>'richText'
WHERE content_blocks->'product-default' IS NOT NULL;

-- Optional: Clean up product-default from content_blocks after migration
-- This is commented out for safety - can be run manually after verification
-- UPDATE products
-- SET content_blocks = content_blocks - 'product-default'
-- WHERE content_blocks ? 'product-default';