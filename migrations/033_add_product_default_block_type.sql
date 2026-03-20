-- Add product-default to the allowed block types constraint
ALTER TABLE product_blocks DROP CONSTRAINT IF EXISTS product_blocks_block_type_check;
ALTER TABLE product_blocks ADD CONSTRAINT product_blocks_block_type_check 
CHECK (block_type IN ('product-default', 'product-hero', 'product-details', 'product-gallery', 'product-features', 'product-hotspot', 'faq'));