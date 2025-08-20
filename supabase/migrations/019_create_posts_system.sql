-- Create posts system for dynamic blog/content management
-- This enables users to create unlimited blog posts for their sites

-- Create posts table to store blog posts for each site
CREATE TABLE IF NOT EXISTS posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    meta_description TEXT,
    meta_keywords TEXT,
    featured_image TEXT,
    excerpt TEXT,
    content TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_posts_site_id ON posts(site_id);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(is_published) WHERE is_published = true;

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_posts_site_slug ON posts(site_id, slug);
CREATE INDEX IF NOT EXISTS idx_posts_site_published ON posts(site_id, is_published) WHERE is_published = true;

-- Ensure unique slugs per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_site_slug_unique ON posts(site_id, slug);

-- Create updated_at trigger
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update page_blocks constraint to allow post slugs
-- First, drop the existing constraint
ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS page_blocks_page_slug_check;

-- Add new constraint that allows post slugs (pattern: post-{slug})
ALTER TABLE page_blocks 
ADD CONSTRAINT page_blocks_page_slug_check 
CHECK (page_slug ~ '^[a-zA-Z0-9_-]+$' OR page_slug = 'global' OR page_slug ~ '^product-[a-zA-Z0-9_-]+$' OR page_slug ~ '^post-[a-zA-Z0-9_-]+$');

-- Insert default post for existing sites
DO $$
DECLARE
    site_record RECORD;
BEGIN
    -- For each existing site, create default post
    FOR site_record IN SELECT id FROM sites LOOP
        -- Check if posts already exist for this site
        IF NOT EXISTS (SELECT 1 FROM posts WHERE site_id = site_record.id) THEN
            -- Create default post
            INSERT INTO posts (site_id, title, slug, meta_description, excerpt, content, is_published, display_order) 
            VALUES (
                site_record.id, 
                'Welcome to Our Blog', 
                'welcome-to-our-blog', 
                'Our first blog post to get you started', 
                'This is your first blog post. Edit or delete it to start writing!',
                'Welcome to your new blog! This is a sample post to help you get started. You can edit this post or create new ones to share your thoughts, news, and updates with your audience.',
                true, 
                1
            );
        END IF;
    END LOOP;
END $$;

-- Create function to automatically create default post when a site is created
CREATE OR REPLACE FUNCTION create_default_post_for_site()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default post for the new site
    INSERT INTO posts (site_id, title, slug, meta_description, excerpt, content, display_order) VALUES
    (NEW.id, 'Welcome to Our Blog', 'welcome-to-our-blog', 'Our first blog post to get you started', 
     'This is your first blog post. Edit or delete it to start writing!',
     'Welcome to your new blog! This is a sample post to help you get started. You can edit this post or create new ones to share your thoughts, news, and updates with your audience.',
     1);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create default post for new sites
CREATE TRIGGER create_default_post_trigger
    AFTER INSERT ON sites
    FOR EACH ROW
    EXECUTE FUNCTION create_default_post_for_site();

-- Create view for easier post queries with site info
CREATE OR REPLACE VIEW post_details AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    (
        SELECT COUNT(*)
        FROM page_blocks pb 
        WHERE pb.site_id = p.site_id 
        AND pb.page_slug = CONCAT('post-', p.slug)
        AND pb.is_active = true
    ) as block_count
FROM posts p
JOIN sites s ON p.site_id = s.id;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO authenticated;
GRANT SELECT ON post_details TO authenticated;