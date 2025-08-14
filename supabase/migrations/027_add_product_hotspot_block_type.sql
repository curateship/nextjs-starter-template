-- Add support for product-hotspot block type
-- This enables the Product Hotspot block to be saved in the database

-- Update the check constraint to include 'product-hotspot'
ALTER TABLE product_blocks 
DROP CONSTRAINT IF EXISTS product_blocks_block_type_check;

ALTER TABLE product_blocks 
ADD CONSTRAINT product_blocks_block_type_check 
CHECK (block_type IN ('product-hero', 'product-features', 'product-hotspot'));