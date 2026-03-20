-- Create User Dashboard System
-- Date: 2025-11-09
-- Purpose: Enable site-scoped user dashboards with customizable pages and blocks
-- Each site has one dashboard configuration that all end_users see with their own data

-- Create site_dashboard_config table
-- Stores dashboard-level settings (navigation, footer, metadata)
CREATE TABLE IF NOT EXISTS site_dashboard_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{"navigation": null, "footer": null}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one dashboard config per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_dashboard_config_site_unique
ON site_dashboard_config(site_id);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_site_dashboard_config_site_id
ON site_dashboard_config(site_id);

-- Create GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_site_dashboard_config_settings
ON site_dashboard_config USING gin (settings);

-- Create site_dashboard_pages table
-- Stores individual pages within a dashboard (home, profile, settings, etc.)
CREATE TABLE IF NOT EXISTS site_dashboard_pages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    meta_description TEXT,
    content_blocks JSONB DEFAULT '{}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dashboard_pages_site_id
ON site_dashboard_pages(site_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_pages_slug
ON site_dashboard_pages(slug);

CREATE INDEX IF NOT EXISTS idx_dashboard_pages_published
ON site_dashboard_pages(is_published) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_dashboard_pages_default
ON site_dashboard_pages(is_default) WHERE is_default = true;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_dashboard_pages_site_slug
ON site_dashboard_pages(site_id, slug);

CREATE INDEX IF NOT EXISTS idx_dashboard_pages_site_published
ON site_dashboard_pages(site_id, is_published) WHERE is_published = true;

-- Ensure unique slugs per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_pages_site_slug_unique
ON site_dashboard_pages(site_id, slug);

-- Ensure only one default page per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_pages_site_default_unique
ON site_dashboard_pages(site_id) WHERE is_default = true;

-- Create GIN index for JSONB content_blocks queries
CREATE INDEX IF NOT EXISTS idx_dashboard_pages_content_blocks
ON site_dashboard_pages USING gin (content_blocks);

-- Create updated_at triggers
CREATE TRIGGER update_site_dashboard_config_updated_at
BEFORE UPDATE ON site_dashboard_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_dashboard_pages_updated_at
BEFORE UPDATE ON site_dashboard_pages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create default dashboard for new sites
CREATE OR REPLACE FUNCTION create_default_dashboard_for_site()
RETURNS TRIGGER AS $$
BEGIN
    -- Create dashboard config
    INSERT INTO site_dashboard_config (site_id, settings)
    VALUES (
        NEW.id,
        '{"navigation": null, "footer": null}'::jsonb
    );

    -- Create default dashboard home page
    INSERT INTO site_dashboard_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
    VALUES (
        NEW.id,
        'Dashboard Home',
        'home',
        'Your personal dashboard',
        true,
        true,
        1
    );

    -- Create profile page
    INSERT INTO site_dashboard_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
    VALUES (
        NEW.id,
        'My Profile',
        'profile',
        'View and edit your profile',
        false,
        true,
        2
    );

    -- Create settings page
    INSERT INTO site_dashboard_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
    VALUES (
        NEW.id,
        'Settings',
        'settings',
        'Manage your account settings',
        false,
        true,
        3
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create dashboard for new sites
CREATE TRIGGER create_default_dashboard_trigger
AFTER INSERT ON sites
FOR EACH ROW
EXECUTE FUNCTION create_default_dashboard_for_site();

-- Initialize dashboards for existing sites
DO $$
DECLARE
    site_record RECORD;
BEGIN
    FOR site_record IN SELECT id FROM sites LOOP
        -- Check if dashboard config doesn't exist
        IF NOT EXISTS (SELECT 1 FROM site_dashboard_config WHERE site_id = site_record.id) THEN
            -- Create dashboard config
            INSERT INTO site_dashboard_config (site_id, settings)
            VALUES (
                site_record.id,
                '{"navigation": null, "footer": null}'::jsonb
            );
        END IF;

        -- Check if dashboard pages don't exist
        IF NOT EXISTS (SELECT 1 FROM site_dashboard_pages WHERE site_id = site_record.id) THEN
            -- Create default pages
            INSERT INTO site_dashboard_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
            VALUES
            (site_record.id, 'Dashboard Home', 'home', 'Your personal dashboard', true, true, 1),
            (site_record.id, 'My Profile', 'profile', 'View and edit your profile', false, true, 2),
            (site_record.id, 'Settings', 'settings', 'Manage your account settings', false, true, 3);
        END IF;
    END LOOP;
END $$;

-- Create view for easier dashboard queries with site info
CREATE OR REPLACE VIEW dashboard_page_details AS
SELECT
    dp.*,
    s.name as site_name,
    s.subdomain,
    s.user_id as site_owner_id,
    (
        SELECT jsonb_object_keys(dp.content_blocks)::int
    ) as block_count
FROM site_dashboard_pages dp
JOIN sites s ON dp.site_id = s.id;

-- Add comments explaining the structure
COMMENT ON TABLE site_dashboard_config IS 'Stores site-level dashboard configuration including navigation and footer. One config per site.';
COMMENT ON COLUMN site_dashboard_config.settings IS 'JSONB storage for dashboard settings. Structure: { "navigation": {...}, "footer": {...} }';

COMMENT ON TABLE site_dashboard_pages IS 'Stores individual pages within a site dashboard. All end_users see the same structure but with their own data.';
COMMENT ON COLUMN site_dashboard_pages.content_blocks IS 'JSONB storage for page blocks. Structure: { "block-id": { "id", "type", "content", "display_order", "created_at", "updated_at" } }';
COMMENT ON COLUMN site_dashboard_pages.is_default IS 'Marks the landing page of the dashboard (typically /user-dashboard route)';

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON site_dashboard_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON site_dashboard_pages TO authenticated;
GRANT SELECT ON dashboard_page_details TO authenticated;
