-- Add database indexes for efficient product blocks batch loading
-- This optimizes the JOIN query used in getAllProductBlocksAction

-- Add index for the JOIN between product_blocks and products
-- This speeds up the inner join on product_id
CREATE INDEX IF NOT EXISTS idx_product_blocks_product_join 
ON product_blocks(product_id, display_order);

-- Add composite index for products table site filtering
-- This speeds up filtering products by site_id
CREATE INDEX IF NOT EXISTS idx_products_site_published 
ON products(site_id, is_published) WHERE is_published = true;

-- Add index for product blocks ordering within products
-- This ensures fast sorting by display_order within each product
CREATE INDEX IF NOT EXISTS idx_product_blocks_order_type 
ON product_blocks(product_id, display_order, block_type);

-- Analyze tables to update query planner statistics
ANALYZE product_blocks;
ANALYZE products;