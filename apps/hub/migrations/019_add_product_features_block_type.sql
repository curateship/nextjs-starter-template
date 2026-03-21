-- Add support for product-features block type
-- This enables the Product Features block to be saved in the database

-- Update the check constraint to include 'product-features'
ALTER TABLE product_blocks 
DROP CONSTRAINT IF EXISTS product_blocks_block_type_check;

ALTER TABLE product_blocks 
ADD CONSTRAINT product_blocks_block_type_check 
CHECK (block_type IN ('product-hero', 'product-features'));