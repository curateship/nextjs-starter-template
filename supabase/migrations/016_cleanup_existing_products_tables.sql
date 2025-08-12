-- Clean up existing products tables safely
-- This removes any existing products and product_blocks tables that may have been created

-- Drop views that might depend on products table
DROP VIEW IF EXISTS product_details CASCADE;

-- Drop triggers and functions related to products
DROP TRIGGER IF EXISTS create_default_product_trigger ON sites CASCADE;
DROP TRIGGER IF EXISTS update_products_updated_at ON products CASCADE;
DROP FUNCTION IF EXISTS create_default_product_for_site() CASCADE;

-- Drop indexes on products table
DROP INDEX IF EXISTS idx_products_site_id CASCADE;
DROP INDEX IF EXISTS idx_products_slug CASCADE;
DROP INDEX IF EXISTS idx_products_published CASCADE;
DROP INDEX IF EXISTS idx_products_site_slug CASCADE;
DROP INDEX IF EXISTS idx_products_site_published CASCADE;
DROP INDEX IF EXISTS idx_products_site_slug_unique CASCADE;

-- Drop indexes on product_blocks table
DROP INDEX IF EXISTS idx_product_blocks_product_id CASCADE;
DROP INDEX IF EXISTS idx_product_blocks_type CASCADE;
DROP INDEX IF EXISTS idx_product_blocks_active CASCADE;
DROP INDEX IF EXISTS idx_product_blocks_product_type CASCADE;
DROP INDEX IF EXISTS idx_product_blocks_unique_active CASCADE;

-- Drop triggers on product_blocks
DROP TRIGGER IF EXISTS update_product_blocks_updated_at ON product_blocks CASCADE;

-- Drop the tables themselves (CASCADE will handle any remaining dependencies)
DROP TABLE IF EXISTS product_blocks CASCADE;
DROP TABLE IF EXISTS products CASCADE;