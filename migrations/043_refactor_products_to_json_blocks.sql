-- Refactor products to use single JSON column instead of separate product_blocks table
-- This improves performance and simplifies the architecture

-- Step 1: Add content_blocks JSON column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '{}';

-- Step 2: Migrate data from product_blocks to products.content_blocks
-- Aggregate all blocks for each product into a single JSON object
UPDATE products 
SET content_blocks = (
    SELECT COALESCE(
        jsonb_object_agg(
            pb.block_type, 
            pb.content || jsonb_build_object('display_order', pb.display_order)
        ), 
        '{}'::jsonb
    )
    FROM product_blocks pb 
    WHERE pb.product_id = products.id
)
WHERE EXISTS (SELECT 1 FROM product_blocks pb WHERE pb.product_id = products.id);

-- Step 3: Add index for JSON queries (PostgreSQL GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_products_content_blocks_gin 
ON products USING gin (content_blocks);

-- Step 4: Add index for specific block type queries (common use case)
-- Note: Using standard GIN index instead of trgm since extension may not be available
CREATE INDEX IF NOT EXISTS idx_products_hero_title 
ON products USING gin ((content_blocks->'product-hero'));

-- Step 5: Verify data migration (this will show any products missing content)
-- Products should have content_blocks populated now
DO $$
DECLARE
    empty_count INTEGER;
    total_products INTEGER;
BEGIN
    SELECT COUNT(*) INTO empty_count 
    FROM products 
    WHERE content_blocks = '{}';
    
    SELECT COUNT(*) INTO total_products 
    FROM products;
    
    RAISE NOTICE 'Migration Summary: % total products, % with empty content_blocks', 
        total_products, empty_count;
END $$;

-- Note: product_blocks table will be dropped in a subsequent migration after testing