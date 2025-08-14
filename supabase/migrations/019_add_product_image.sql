-- Add featured_image column to products table
ALTER TABLE products
ADD COLUMN featured_image TEXT;

-- Add index for products with images (for filtering)
CREATE INDEX idx_products_featured_image ON products(featured_image) WHERE featured_image IS NOT NULL;

-- Update the product_details view to include the new column
DROP VIEW IF EXISTS product_details;
CREATE OR REPLACE VIEW product_details AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    COUNT(pb.id) as block_count
FROM products p
LEFT JOIN sites s ON p.site_id = s.id
LEFT JOIN product_blocks pb ON p.id = pb.product_id AND pb.is_active = true
GROUP BY p.id, s.name, s.subdomain, s.user_id;