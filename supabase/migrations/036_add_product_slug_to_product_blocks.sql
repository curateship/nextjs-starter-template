-- Add product_slug to product_blocks for direct string-based grouping (matching page_blocks pattern)
-- This makes products work exactly like pages with identical loading patterns

-- Step 1: Add product_slug column to product_blocks (nullable initially)
ALTER TABLE product_blocks 
ADD COLUMN product_slug VARCHAR(100);

-- Step 2: Populate product_slug from products table for existing data
UPDATE product_blocks 
SET product_slug = products.slug 
FROM products 
WHERE product_blocks.product_id = products.id;

-- Step 3: Make product_slug required now that data is populated
ALTER TABLE product_blocks 
ALTER COLUMN product_slug SET NOT NULL;

-- Step 4: Add index for efficient product_slug queries (matching page_blocks pattern)
CREATE INDEX IF NOT EXISTS idx_product_blocks_product_slug ON product_blocks(product_slug);

-- Step 5: Add composite index for site + product_slug (for product-specific queries)
CREATE INDEX IF NOT EXISTS idx_product_blocks_site_product_slug 
ON product_blocks(site_id, product_slug, display_order);

-- Step 6: Update table statistics for query planner
ANALYZE product_blocks;

-- Note: product_blocks now has both product_id (for relations) and product_slug (for grouping)
-- This matches the page_blocks pattern where page_slug is used for direct grouping