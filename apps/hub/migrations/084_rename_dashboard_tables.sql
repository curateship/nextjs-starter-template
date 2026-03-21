-- Rename dashboard tables to use users_ prefix for clarity
-- Date: 2025-11-09
-- Purpose: Rename tables to better reflect that these are user dashboards

-- Rename the tables
ALTER TABLE site_dashboard_config RENAME TO users_dashboard_config;
ALTER TABLE site_dashboard_pages RENAME TO users_dashboard_pages;

-- Rename the view
DROP VIEW IF EXISTS dashboard_page_details;
CREATE OR REPLACE VIEW users_dashboard_page_details AS
SELECT
    dp.*,
    s.name as site_name,
    s.subdomain,
    s.user_id as site_owner_id,
    (
        SELECT jsonb_object_keys(dp.content_blocks)::int
    ) as block_count
FROM users_dashboard_pages dp
JOIN sites s ON dp.site_id = s.id;

-- Update comments
COMMENT ON TABLE users_dashboard_config IS 'Stores site-level user dashboard configuration including navigation and footer. One config per site.';
COMMENT ON COLUMN users_dashboard_config.settings IS 'JSONB storage for dashboard settings. Structure: { "navigation": {...}, "footer": {...} }';

COMMENT ON TABLE users_dashboard_pages IS 'Stores individual pages within a site user dashboard. All end_users see the same structure but with their own data.';
COMMENT ON COLUMN users_dashboard_pages.content_blocks IS 'JSONB storage for page blocks. Structure: { "block-id": { "id", "type", "content", "display_order", "created_at", "updated_at" } }';
COMMENT ON COLUMN users_dashboard_pages.is_default IS 'Marks the landing page of the dashboard (typically /user-dashboard route)';

-- Grant permissions on renamed tables
GRANT SELECT, INSERT, UPDATE, DELETE ON users_dashboard_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON users_dashboard_pages TO authenticated;
GRANT SELECT ON users_dashboard_page_details TO authenticated;
