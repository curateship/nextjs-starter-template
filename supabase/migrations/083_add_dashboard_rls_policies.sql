-- Add Row Level Security policies for User Dashboard tables
-- Date: 2025-11-09
-- Purpose: Secure dashboard tables with proper access control

-- Enable RLS on dashboard tables
ALTER TABLE site_dashboard_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_dashboard_pages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SITE_DASHBOARD_CONFIG POLICIES
-- =============================================================================

-- Policy: Super admins can manage all dashboard configs
CREATE POLICY "Super admins can manage all dashboard configs"
ON site_dashboard_config FOR ALL
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- Policy: Site owners can view their site's dashboard config
CREATE POLICY "Site owners can view their dashboard config"
ON site_dashboard_config FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_config.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: Site owners can update their site's dashboard config
CREATE POLICY "Site owners can update their dashboard config"
ON site_dashboard_config FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_config.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: End users can view dashboard config for sites they have access to
-- (For now, all authenticated users can view - can be refined with membership checks later)
CREATE POLICY "End users can view dashboard configs"
ON site_dashboard_config FOR SELECT
USING (
    auth.uid() IS NOT NULL
);

-- =============================================================================
-- SITE_DASHBOARD_PAGES POLICIES
-- =============================================================================

-- Policy: Super admins can manage all dashboard pages
CREATE POLICY "Super admins can manage all dashboard pages"
ON site_dashboard_pages FOR ALL
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- Policy: Site owners can view their site's dashboard pages
CREATE POLICY "Site owners can view their dashboard pages"
ON site_dashboard_pages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: Site owners can insert dashboard pages for their sites
CREATE POLICY "Site owners can create dashboard pages"
ON site_dashboard_pages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: Site owners can update their site's dashboard pages
CREATE POLICY "Site owners can update their dashboard pages"
ON site_dashboard_pages FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: Site owners can delete their site's dashboard pages
CREATE POLICY "Site owners can delete their dashboard pages"
ON site_dashboard_pages FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = site_dashboard_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

-- Policy: End users can view published dashboard pages
-- (All authenticated users can view published pages - can be refined with membership checks later)
CREATE POLICY "End users can view published dashboard pages"
ON site_dashboard_pages FOR SELECT
USING (
    auth.uid() IS NOT NULL AND is_published = true
);

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================

COMMENT ON POLICY "Super admins can manage all dashboard configs" ON site_dashboard_config IS
    'Platform super_admins have full access to all dashboard configurations for support and management.';

COMMENT ON POLICY "Site owners can view their dashboard config" ON site_dashboard_config IS
    'Site owners (user_id in sites table) can view their own site dashboard configuration.';

COMMENT ON POLICY "End users can view dashboard configs" ON site_dashboard_config IS
    'All authenticated users can view dashboard configs. Future: Add membership/subscription checks.';

COMMENT ON POLICY "Super admins can manage all dashboard pages" ON site_dashboard_pages IS
    'Platform super_admins have full access to all dashboard pages for support and management.';

COMMENT ON POLICY "Site owners can view their dashboard pages" ON site_dashboard_pages IS
    'Site owners can view all dashboard pages for their sites (both published and unpublished).';

COMMENT ON POLICY "End users can view published dashboard pages" ON site_dashboard_pages IS
    'Authenticated end_users can view published dashboard pages. Future: Add site membership checks.';
