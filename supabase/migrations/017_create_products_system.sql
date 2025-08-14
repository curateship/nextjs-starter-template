-- Create products system for dynamic product management
-- This enables users to create unlimited custom products for their sites

-- Create products table to store custom products for each site
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    meta_description TEXT,
    meta_keywords TEXT,
    is_homepage BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published) WHERE is_published = true;

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_products_site_slug ON products(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_products_site_published ON products(site_id, is_published) WHERE is_published = true;

-- Ensure unique slugs per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_site_slug_unique ON products(site_id, slug);

-- Create updated_at trigger
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update page_blocks constraint to allow product slugs
-- First, drop the existing constraint
ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS page_blocks_page_slug_check;

-- Add new constraint that allows product slugs (pattern: product-{slug})
ALTER TABLE page_blocks 
ADD CONSTRAINT page_blocks_page_slug_check 
CHECK (page_slug ~ '^[a-zA-Z0-9_-]+$' OR page_slug = 'global' OR page_slug ~ '^product-[a-zA-Z0-9_-]+$');

-- Insert default product for existing sites
DO $$
DECLARE
    site_record RECORD;
BEGIN
    -- For each existing site, create default product
    FOR site_record IN SELECT id FROM sites LOOP
        -- Check if products already exist for this site
        IF NOT EXISTS (SELECT 1 FROM products WHERE site_id = site_record.id) THEN
            -- Create default product
            INSERT INTO products (site_id, title, slug, meta_description, is_homepage, is_published, display_order) 
            VALUES (
                site_record.id, 
                'New Product', 
                'new-product', 
                'A sample product to get you started', 
                false,
                true, 
                1
            );
        END IF;
    END LOOP;
END $$;

-- Create function to automatically create default product when a site is created
CREATE OR REPLACE FUNCTION create_default_product_for_site()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default product for the new site
    INSERT INTO products (site_id, title, slug, meta_description, is_homepage, display_order) VALUES
    (NEW.id, 'New Product', 'new-product', 'A sample product to get you started', false, 1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create default product for new sites
CREATE TRIGGER create_default_product_trigger
    AFTER INSERT ON sites
    FOR EACH ROW
    EXECUTE FUNCTION create_default_product_for_site();

-- Create view for easier product queries with site info
CREATE OR REPLACE VIEW product_details AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    (
        SELECT COUNT(*)
        FROM page_blocks sb 
        WHERE sb.site_id = p.site_id 
        AND sb.page_slug = CONCAT('product-', p.slug)
        AND sb.is_active = true
    ) as block_count
FROM products p
JOIN sites s ON p.site_id = s.id;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT SELECT ON product_details TO authenticated;