-- Create theme blocks system for default block configurations
-- This enables themes to define default content for navigation, hero, and footer blocks

-- Create theme_blocks table to store default block configurations for themes
CREATE TABLE IF NOT EXISTS theme_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('navigation', 'hero', 'footer')),
    page_slug VARCHAR(50) NOT NULL DEFAULT 'home' CHECK (page_slug IN ('home', 'global')),
    default_content JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_theme_blocks_theme_id ON theme_blocks(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_blocks_type ON theme_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_theme_blocks_page ON theme_blocks(page_slug);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_theme_blocks_theme_page ON theme_blocks(theme_id, page_slug);

-- Ensure unique block types per theme per page
CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_blocks_unique 
ON theme_blocks(theme_id, block_type, page_slug);

-- Create updated_at trigger
CREATE TRIGGER update_theme_blocks_updated_at BEFORE UPDATE ON theme_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create site_blocks table to store actual block content for each site
CREATE TABLE IF NOT EXISTS site_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('navigation', 'hero', 'footer')),
    page_slug VARCHAR(50) NOT NULL DEFAULT 'home' CHECK (page_slug IN ('home', 'global')),
    content JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_site_blocks_site_id ON site_blocks(site_id);
CREATE INDEX IF NOT EXISTS idx_site_blocks_type ON site_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_site_blocks_page ON site_blocks(page_slug);
CREATE INDEX IF NOT EXISTS idx_site_blocks_active ON site_blocks(is_active) WHERE is_active = true;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_site_blocks_site_page ON site_blocks(site_id, page_slug);
CREATE INDEX IF NOT EXISTS idx_site_blocks_site_active ON site_blocks(site_id, is_active) WHERE is_active = true;

-- Ensure unique active block types per site per page
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_blocks_unique_active 
ON site_blocks(site_id, block_type, page_slug) WHERE is_active = true;

-- Create updated_at trigger
CREATE TRIGGER update_site_blocks_updated_at BEFORE UPDATE ON site_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default blocks for the existing Marketplace theme
-- First, get the theme ID (assuming it exists from previous migration)
DO $$
DECLARE
    marketplace_theme_id UUID;
BEGIN
    -- Get the Marketplace theme ID
    SELECT id INTO marketplace_theme_id 
    FROM themes 
    WHERE name = 'Marketplace' 
    LIMIT 1;
    
    -- Only insert if theme exists
    IF marketplace_theme_id IS NOT NULL THEN
        -- Insert default navigation block
        INSERT INTO theme_blocks (theme_id, block_type, page_slug, default_content, display_order) VALUES 
        (marketplace_theme_id, 'navigation', 'global', '{
            "logo": "/images/logo.png",
            "links": [
                {"text": "Home", "url": "/"},
                {"text": "Products", "url": "/products"},
                {"text": "About", "url": "/about"},
                {"text": "Contact", "url": "/contact"}
            ],
            "style": {
                "backgroundColor": "#ffffff",
                "textColor": "#000000"
            }
        }', 0);
        
        -- Insert default hero block
        INSERT INTO theme_blocks (theme_id, block_type, page_slug, default_content, display_order) VALUES 
        (marketplace_theme_id, 'hero', 'home', '{
            "title": "Welcome to Our Marketplace",
            "subtitle": "Discover amazing products from trusted sellers around the world",
            "primaryButton": {
                "text": "Shop Now",
                "url": "/products"
            },
            "secondaryButton": {
                "text": "Learn More",
                "url": "/about"
            },
            "backgroundImage": "/images/hero-bg.jpg",
            "style": {
                "backgroundColor": "#f8fafc",
                "textColor": "#1e293b"
            }
        }', 1);
        
        -- Insert default footer block
        INSERT INTO theme_blocks (theme_id, block_type, page_slug, default_content, display_order) VALUES 
        (marketplace_theme_id, 'footer', 'global', '{
            "copyright": "© 2024 Marketplace. All rights reserved.",
            "links": [
                {"text": "Privacy Policy", "url": "/privacy"},
                {"text": "Terms of Service", "url": "/terms"},
                {"text": "Support", "url": "/support"}
            ],
            "socialLinks": [
                {"platform": "twitter", "url": "https://twitter.com/marketplace"},
                {"platform": "facebook", "url": "https://facebook.com/marketplace"}
            ],
            "style": {
                "backgroundColor": "#1f2937",
                "textColor": "#ffffff"
            }
        }', 999);
    END IF;
END $$;

-- Create function to copy theme blocks to site blocks when a site is created
CREATE OR REPLACE FUNCTION copy_theme_blocks_to_site(p_site_id UUID, p_theme_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert site blocks based on theme blocks
    INSERT INTO site_blocks (site_id, block_type, page_slug, content, display_order)
    SELECT 
        p_site_id,
        tb.block_type,
        tb.page_slug,
        tb.default_content,
        tb.display_order
    FROM theme_blocks tb
    WHERE tb.theme_id = p_theme_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;