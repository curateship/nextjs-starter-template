-- Add FAQ block type to product_blocks
-- Update the check constraint to include 'faq'
ALTER TABLE product_blocks 
DROP CONSTRAINT IF EXISTS product_blocks_block_type_check;

ALTER TABLE product_blocks 
ADD CONSTRAINT product_blocks_block_type_check 
CHECK (block_type IN ('product-hero', 'product-features', 'product-hotspot', 'faq'));