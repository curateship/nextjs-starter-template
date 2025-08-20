-- Remove the is_active column and all dependent objects from page_blocks table
-- This follows the same pattern as 031_remove_is_active_from_product_blocks.sql

-- First, drop dependent views that reference is_active
DROP VIEW IF EXISTS page_details CASCADE;
DROP VIEW IF EXISTS post_details CASCADE;

-- Drop RLS policy that depends on is_active
DROP POLICY IF EXISTS "Public can view active blocks for published sites" ON page_blocks;

-- Drop indexes that depend on is_active column
DROP INDEX IF EXISTS idx_page_blocks_active;
DROP INDEX IF EXISTS idx_page_blocks_site_active;

-- Drop unique constraint that depends on is_active
DROP INDEX IF EXISTS idx_page_blocks_unique_active;

-- Clean up blocks more aggressively
-- First, remove orphaned blocks for pages that no longer exist
DELETE FROM page_blocks 
WHERE page_slug NOT IN ('home', 'global') 
AND page_slug NOT IN (
    SELECT slug FROM pages WHERE pages.site_id = page_blocks.site_id
);

-- Also remove blocks for deleted sites
DELETE FROM page_blocks 
WHERE site_id NOT IN (SELECT id FROM sites);

-- Standardize page_slug values (many blocks might have inconsistent page_slug values)
UPDATE page_blocks 
SET page_slug = 'home' 
WHERE page_slug = 'global' OR page_slug IS NULL;

-- For hero blocks specifically, keep only the most recent one per site
-- since hero blocks should typically be unique per page
DELETE FROM page_blocks 
WHERE block_type = 'hero' 
AND id NOT IN (
    SELECT DISTINCT ON (site_id, page_slug) id
    FROM page_blocks
    WHERE block_type = 'hero'
    ORDER BY site_id, page_slug, created_at DESC
);

-- For navigation and footer blocks, keep only one per site regardless of page_slug
-- These should be truly global
DELETE FROM page_blocks 
WHERE block_type IN ('navigation', 'footer')
AND id NOT IN (
    SELECT DISTINCT ON (site_id, block_type) id
    FROM page_blocks
    WHERE block_type IN ('navigation', 'footer')
    ORDER BY site_id, block_type, created_at DESC
);

-- For other block types, keep the most recent for each (site_id, block_type, page_slug) combination
DELETE FROM page_blocks 
WHERE block_type NOT IN ('hero', 'navigation', 'footer')
AND id NOT IN (
    SELECT DISTINCT ON (site_id, block_type, page_slug) id
    FROM page_blocks
    WHERE block_type NOT IN ('hero', 'navigation', 'footer')
    ORDER BY site_id, block_type, page_slug, created_at DESC
);

-- Remove the is_active column
ALTER TABLE page_blocks DROP COLUMN IF EXISTS is_active;

-- Add simple unique constraint for essential blocks only (navigation, footer)
-- This prevents duplicate nav/footer but allows multiple hero, rich-text, etc.
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_blocks_nav_footer_unique 
ON page_blocks(site_id, block_type, page_slug) 
WHERE block_type IN ('navigation', 'footer');

-- Ensure every site has navigation and footer blocks
-- Insert missing navigation blocks for sites that don't have them
INSERT INTO page_blocks (site_id, block_type, page_slug, content, display_order)
SELECT 
    s.id as site_id,
    'navigation' as block_type,
    'home' as page_slug,
    '{
        "logo": "",
        "links": [
            {"text": "Home", "url": "/"},
            {"text": "About", "url": "/about"},
            {"text": "Contact", "url": "/contact"}
        ],
        "style": {
            "backgroundColor": "#ffffff",
            "textColor": "#000000"
        }
    }'::jsonb as content,
    0 as display_order
FROM sites s
WHERE NOT EXISTS (
    SELECT 1 FROM page_blocks pb 
    WHERE pb.site_id = s.id AND pb.block_type = 'navigation'
);

-- Insert missing footer blocks for sites that don't have them
INSERT INTO page_blocks (site_id, block_type, page_slug, content, display_order)
SELECT 
    s.id as site_id,
    'footer' as block_type,
    'home' as page_slug,
    '{
        "copyright": "© 2024 All rights reserved.",
        "links": [
            {"text": "Privacy Policy", "url": "/privacy"},
            {"text": "Terms of Service", "url": "/terms"}
        ],
        "socialLinks": [],
        "style": {
            "backgroundColor": "#1f2937",
            "textColor": "#ffffff"
        }
    }'::jsonb as content,
    999 as display_order
FROM sites s
WHERE NOT EXISTS (
    SELECT 1 FROM page_blocks pb 
    WHERE pb.site_id = s.id AND pb.block_type = 'footer'
);

-- Update the copy_theme_blocks_to_site function to include fallback for essential blocks
CREATE OR REPLACE FUNCTION copy_theme_blocks_to_site(p_site_id UUID, p_theme_id UUID)
RETURNS VOID AS $$
BEGIN
    -- First, try to copy theme blocks
    INSERT INTO page_blocks (site_id, block_type, page_slug, content, display_order)
    SELECT 
        p_site_id,
        tb.block_type,
        tb.page_slug,
        tb.default_content,
        tb.display_order
    FROM theme_blocks tb
    WHERE tb.theme_id = p_theme_id;
    
    -- Always ensure navigation block exists (fallback if theme has no nav)
    INSERT INTO page_blocks (site_id, block_type, page_slug, content, display_order)
    SELECT 
        p_site_id,
        'navigation',
        'home',
        '{
            "logo": "",
            "links": [
                {"text": "Home", "url": "/"},
                {"text": "About", "url": "/about"},
                {"text": "Contact", "url": "/contact"}
            ],
            "style": {
                "backgroundColor": "#ffffff",
                "textColor": "#000000"
            }
        }'::jsonb,
        0
    WHERE NOT EXISTS (
        SELECT 1 FROM page_blocks 
        WHERE site_id = p_site_id AND block_type = 'navigation'
    );
    
    -- Always ensure footer block exists (fallback if theme has no footer)
    INSERT INTO page_blocks (site_id, block_type, page_slug, content, display_order)
    SELECT 
        p_site_id,
        'footer',
        'home',
        '{
            "copyright": "© 2024 All rights reserved.",
            "links": [
                {"text": "Privacy Policy", "url": "/privacy"},
                {"text": "Terms of Service", "url": "/terms"}
            ],
            "socialLinks": [],
            "style": {
                "backgroundColor": "#1f2937",
                "textColor": "#ffffff"
            }
        }'::jsonb,
        999
    WHERE NOT EXISTS (
        SELECT 1 FROM page_blocks 
        WHERE site_id = p_site_id AND block_type = 'footer'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate views without is_active dependency
-- Note: Views will be recreated with updated schema in subsequent migrations if needed