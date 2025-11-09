-- Consolidate users_pages_config into sites.settings
-- Date: 2025-11-09
-- Purpose: Move user pages navigation/footer from separate table into sites.settings for consistency

-- =============================================================================
-- STEP 1: Restructure existing sites.settings to use namespaced structure
-- =============================================================================

-- Move existing navigation/footer to public_pages namespace
UPDATE sites
SET settings = jsonb_build_object(
    'public_pages', jsonb_build_object(
        'navigation', COALESCE(settings->'navigation', 'null'::jsonb),
        'footer', COALESCE(settings->'footer', 'null'::jsonb)
    ),
    'user_pages', jsonb_build_object(
        'navigation', 'null'::jsonb,
        'footer', 'null'::jsonb
    )
)
WHERE settings IS NOT NULL;

-- Handle sites with null settings
UPDATE sites
SET settings = jsonb_build_object(
    'public_pages', jsonb_build_object(
        'navigation', 'null'::jsonb,
        'footer', 'null'::jsonb
    ),
    'user_pages', jsonb_build_object(
        'navigation', 'null'::jsonb,
        'footer', 'null'::jsonb
    )
)
WHERE settings IS NULL;

-- =============================================================================
-- STEP 2: Migrate data from users_pages_config to sites.settings.user_pages
-- =============================================================================

UPDATE sites s
SET settings = jsonb_set(
    jsonb_set(
        s.settings,
        '{user_pages,navigation}',
        COALESCE(c.settings->'navigation', 'null'::jsonb)
    ),
    '{user_pages,footer}',
    COALESCE(c.settings->'footer', 'null'::jsonb)
)
FROM users_pages_config c
WHERE s.id = c.site_id;

-- =============================================================================
-- STEP 3: Drop policies on users_pages_config
-- =============================================================================

DROP POLICY IF EXISTS "Super admins can manage all user pages configs" ON users_pages_config;
DROP POLICY IF EXISTS "Site owners can view their user pages config" ON users_pages_config;
DROP POLICY IF EXISTS "Site owners can update their user pages config" ON users_pages_config;
DROP POLICY IF EXISTS "End users can view user pages configs" ON users_pages_config;

-- =============================================================================
-- STEP 4: Drop the users_pages_config table
-- =============================================================================

DROP TABLE IF EXISTS users_pages_config CASCADE;

-- =============================================================================
-- STEP 5: Update sites table comment
-- =============================================================================

COMMENT ON COLUMN sites.settings IS
    'Site configuration stored as JSONB. Structure: {
        public_pages: { navigation: {...}, footer: {...} },
        user_pages: { navigation: {...}, footer: {...} }
    }';

-- =============================================================================
-- STEP 6: Drop the now-unused view
-- =============================================================================

DROP VIEW IF EXISTS users_pages_details;
