-- Add site_id to product_blocks for direct site scoping (matching page_blocks architecture)
-- This simplifies queries and improves performance by eliminating JOINs

-- Step 0: Clean up any leftover triggers that reference removed is_active column
DROP TRIGGER IF EXISTS update_product_blocks_soft_delete ON product_blocks;
DROP FUNCTION IF EXISTS update_product_blocks_deleted_at();
DROP FUNCTION IF EXISTS cleanup_old_product_blocks();

-- Step 1: Add site_id column to product_blocks (nullable initially)
ALTER TABLE product_blocks 
ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

-- Step 2: Populate site_id from products table for existing data
UPDATE product_blocks 
SET site_id = products.site_id 
FROM products 
WHERE product_blocks.product_id = products.id;

-- Step 3: Make site_id required now that data is populated
ALTER TABLE product_blocks 
ALTER COLUMN site_id SET NOT NULL;

-- Step 4: Add index for efficient site-scoped queries (matching page_blocks pattern)
CREATE INDEX IF NOT EXISTS idx_product_blocks_site_id ON product_blocks(site_id);

-- Step 5: Add composite index for common query patterns (site + product + order)
CREATE INDEX IF NOT EXISTS idx_product_blocks_site_product_order 
ON product_blocks(site_id, product_id, display_order);

-- Step 6: Add composite index for site + display_order (for site-wide product block queries)
CREATE INDEX IF NOT EXISTS idx_product_blocks_site_order 
ON product_blocks(site_id, display_order);

-- Step 7: Update table statistics for query planner
ANALYZE product_blocks;

-- Note: This change makes product_blocks architecture identical to page_blocks
-- Both now support direct site scoping for optimal multi-tenant performance