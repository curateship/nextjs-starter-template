-- Rename users_dashboard tables to users_pages
-- Date: 2025-11-09
-- Purpose: Rename all dashboard-related tables to use "pages" terminology for clarity

-- =============================================================================
-- DROP EXISTING POLICIES
-- =============================================================================

-- Drop policies on users_dashboard_config
DROP POLICY IF EXISTS "Super admins can manage all dashboard configs" ON users_dashboard_config;
DROP POLICY IF EXISTS "Site owners can view their dashboard config" ON users_dashboard_config;
DROP POLICY IF EXISTS "Site owners can update their dashboard config" ON users_dashboard_config;
DROP POLICY IF EXISTS "End users can view dashboard configs" ON users_dashboard_config;

-- Drop policies on users_dashboard_pages
DROP POLICY IF EXISTS "Super admins can manage all dashboard pages" ON users_dashboard_pages;
DROP POLICY IF EXISTS "Site owners can view their dashboard pages" ON users_dashboard_pages;
DROP POLICY IF EXISTS "Site owners can create dashboard pages" ON users_dashboard_pages;
DROP POLICY IF EXISTS "Site owners can update their dashboard pages" ON users_dashboard_pages;
DROP POLICY IF EXISTS "Site owners can delete their dashboard pages" ON users_dashboard_pages;
DROP POLICY IF EXISTS "End users can view published dashboard pages" ON users_dashboard_pages;

-- =============================================================================
-- DROP EXISTING VIEW
-- =============================================================================

DROP VIEW IF EXISTS users_dashboard_page_details;

-- =============================================================================
-- RENAME TABLES
-- =============================================================================

-- Rename users_dashboard_config to users_pages_config
ALTER TABLE users_dashboard_config RENAME TO users_pages_config;

-- Rename users_dashboard_pages to users_pages
ALTER TABLE users_dashboard_pages RENAME TO users_pages;

-- =============================================================================
-- UPDATE TABLE COMMENTS
-- =============================================================================

COMMENT ON TABLE users_pages_config IS
    'Configuration settings for user pages functionality per site. Controls customization, features, and layout options.';

COMMENT ON TABLE users_pages IS
    'User-facing pages with customizable content blocks. Each page belongs to a site and can have custom layouts.';

-- =============================================================================
-- RECREATE VIEW WITH NEW TABLE NAMES
-- =============================================================================

CREATE OR REPLACE VIEW users_pages_details AS
SELECT
    p.id,
    p.site_id,
    p.title,
    p.slug,
    p.meta_description,
    p.is_default,
    p.is_published,
    p.content_blocks,
    p.display_order,
    p.created_at,
    p.updated_at,
    s.name as site_name,
    s.subdomain as site_subdomain
FROM
    users_pages p
    LEFT JOIN sites s ON p.site_id = s.id;

COMMENT ON VIEW users_pages_details IS
    'Detailed view of user pages joined with site information for easier querying.';

-- =============================================================================
-- RECREATE RLS POLICIES WITH NEW NAMES
-- =============================================================================

-- Enable RLS on renamed tables
ALTER TABLE users_pages_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_pages ENABLE ROW LEVEL SECURITY;

-- Users Pages Config Policies
CREATE POLICY "Super admins can manage all user pages configs"
ON users_pages_config FOR ALL
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "Site owners can view their user pages config"
ON users_pages_config FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages_config.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "Site owners can update their user pages config"
ON users_pages_config FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages_config.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "End users can view user pages configs"
ON users_pages_config FOR SELECT
USING (
    auth.uid() IS NOT NULL
);

-- Users Pages Policies
CREATE POLICY "Super admins can manage all user pages"
ON users_pages FOR ALL
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "Site owners can view their user pages"
ON users_pages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "Site owners can create user pages"
ON users_pages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "Site owners can update their user pages"
ON users_pages FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "Site owners can delete their user pages"
ON users_pages FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM sites
        WHERE sites.id = users_pages.site_id
        AND sites.user_id = auth.uid()
    )
);

CREATE POLICY "End users can view published user pages"
ON users_pages FOR SELECT
USING (
    auth.uid() IS NOT NULL AND is_published = true
);

-- =============================================================================
-- UPDATE POLICY COMMENTS
-- =============================================================================

COMMENT ON POLICY "Super admins can manage all user pages configs" ON users_pages_config IS
    'Platform super_admins have full access to all user pages configurations for support and management.';

COMMENT ON POLICY "Site owners can view their user pages config" ON users_pages_config IS
    'Site owners (user_id in sites table) can view their own site user pages configuration.';

COMMENT ON POLICY "End users can view user pages configs" ON users_pages_config IS
    'All authenticated users can view user pages configs. Future: Add membership/subscription checks.';

COMMENT ON POLICY "Super admins can manage all user pages" ON users_pages IS
    'Platform super_admins have full access to all user pages for support and management.';

COMMENT ON POLICY "Site owners can view their user pages" ON users_pages IS
    'Site owners can view all user pages for their sites (both published and unpublished).';

COMMENT ON POLICY "End users can view published user pages" ON users_pages IS
    'Authenticated end_users can view published user pages. Future: Add site membership checks.';
