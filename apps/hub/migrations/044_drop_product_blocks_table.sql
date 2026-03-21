-- Drop the old product_blocks table since we now use JSON content_blocks in products table
-- This completes the refactoring from relational blocks to JSON storage

-- Step 1: Drop indexes related to product_blocks
DROP INDEX IF EXISTS product_blocks_product_id_idx;
DROP INDEX IF EXISTS product_blocks_site_id_idx;
DROP INDEX IF EXISTS product_blocks_display_order_idx;

-- Step 2: Drop the product_blocks table entirely
DROP TABLE IF EXISTS product_blocks;

-- Step 3: Verify the products table has the content_blocks column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'content_blocks'
    ) THEN
        RAISE EXCEPTION 'products.content_blocks column does not exist! Migration 043 must be run first.';
    END IF;
    
    RAISE NOTICE 'Successfully dropped product_blocks table. Products now use content_blocks JSON column.';
END $$;