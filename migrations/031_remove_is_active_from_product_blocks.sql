-- Remove the is_active column and all dependent objects from product_blocks table
-- We don't need this overcomplicated staging system

-- Drop dependent objects first
DROP POLICY IF EXISTS "Public can view active blocks for published products" ON product_blocks;
DROP VIEW IF EXISTS product_details;
DROP VIEW IF EXISTS active_product_blocks;

-- Now we can drop the column
ALTER TABLE product_blocks DROP COLUMN IF EXISTS is_active;