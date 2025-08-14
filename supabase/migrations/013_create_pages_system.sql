-- Create pages system for dynamic page management
-- This enables users to create unlimited custom pages for their sites

-- Create pages table to store custom pages for each site
CREATE TABLE IF NOT EXISTS pages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    meta_description TEXT,
    meta_keywords TEXT,
    template VARCHAR(50) NOT NULL DEFAULT 'default' CHECK (template IN ('default', 'blank', 'blog-post', 'landing')),
    is_homepage BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_pages_site_id ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_published ON pages(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_pages_homepage ON pages(is_homepage) WHERE is_homepage = true;

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_pages_site_slug ON pages(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_pages_site_published ON pages(site_id, is_published) WHERE is_published = true;

-- Ensure unique slugs per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_site_slug_unique ON pages(site_id, slug);

-- Ensure only one homepage per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_site_homepage_unique ON pages(site_id) WHERE is_homepage = true;

-- Create updated_at trigger
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Remove the constraint on page_slug from page_blocks to allow any page
ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS page_blocks_page_slug_check;

-- Add new constraint that allows any valid page slug (alphanumeric, hyphens, underscores)
ALTER TABLE page_blocks 
ADD CONSTRAINT page_blocks_page_slug_check 
CHECK (page_slug ~ '^[a-zA-Z0-9_-]+$' OR page_slug = 'global');

-- Remove the unique constraint on page_blocks that was too restrictive
DROP INDEX IF EXISTS idx_page_blocks_unique_active;

-- Create new unique constraint that allows multiple blocks per page but ensures unique block types per page
-- Only navigation and footer blocks should be unique per page, other blocks can have multiple instances
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_blocks_nav_footer_unique 
ON page_blocks(site_id, block_type, page_slug) 
WHERE is_active = true AND block_type IN ('navigation', 'footer');

-- Insert default pages for existing sites
DO $$
DECLARE
    site_record RECORD;
BEGIN
    -- For each existing site, create default pages
    FOR site_record IN SELECT id FROM sites LOOP
        -- Check if pages already exist for this site
        IF NOT EXISTS (SELECT 1 FROM pages WHERE site_id = site_record.id) THEN
            -- Create home page
            INSERT INTO pages (site_id, title, slug, meta_description, is_homepage, is_published, display_order) 
            VALUES (
                site_record.id, 
                'Home', 
                'home', 
                'Welcome to our website', 
                true,
                true, 
                1
            );
            
            -- Create about page
            INSERT INTO pages (site_id, title, slug, meta_description, is_homepage, is_published, display_order) 
            VALUES (
                site_record.id, 
                'About Us', 
                'about', 
                'Learn more about our company and mission',
                false, 
                true,
                2
            );
            
            -- Create contact page
            INSERT INTO pages (site_id, title, slug, meta_description, is_homepage, is_published, display_order) 
            VALUES (
                site_record.id, 
                'Contact Us', 
                'contact', 
                'Get in touch with our team',
                false,
                true, 
                3
            );
        END IF;
    END LOOP;
END $$;

-- Create function to automatically create default pages when a site is created
CREATE OR REPLACE FUNCTION create_default_pages_for_site()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default pages for the new site
    INSERT INTO pages (site_id, title, slug, meta_description, is_homepage, display_order) VALUES
    (NEW.id, 'Home', 'home', 'Welcome to our website', true, 1),
    (NEW.id, 'About Us', 'about', 'Learn more about our company and mission', false, 2),
    (NEW.id, 'Contact Us', 'contact', 'Get in touch with our team', false, 3);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create default pages for new sites
CREATE TRIGGER create_default_pages_trigger
    AFTER INSERT ON sites
    FOR EACH ROW
    EXECUTE FUNCTION create_default_pages_for_site();

-- Create view for easier page queries with site info
CREATE OR REPLACE VIEW page_details AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    (
        SELECT COUNT(*)
        FROM page_blocks sb 
        WHERE sb.site_id = p.site_id 
        AND sb.page_slug = p.slug 
        AND sb.is_active = true
    ) as block_count
FROM pages p
JOIN sites s ON p.site_id = s.id;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO authenticated;
GRANT SELECT ON page_details TO authenticated;