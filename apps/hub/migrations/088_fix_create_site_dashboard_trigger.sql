-- Fix the create_default_dashboard_for_site trigger function
-- Date: 2025-02-25
-- Purpose: The function still referenced old table names (site_dashboard_config, site_dashboard_pages)
-- which were renamed to users_pages (086) and site_dashboard_config was consolidated into sites.settings (087)
-- This caused "relation site_dashboard_config does not exist" errors when creating new sites

CREATE OR REPLACE FUNCTION create_default_dashboard_for_site()
RETURNS TRIGGER AS $$
BEGIN
    -- Initialize sites.settings with namespaced structure if not already set
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
    WHERE id = NEW.id AND (settings IS NULL OR settings = '{}'::jsonb);

    -- Create default user pages
    INSERT INTO users_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
    VALUES (
        NEW.id,
        'Dashboard Home',
        'home',
        'Your personal dashboard',
        true,
        true,
        1
    );

    INSERT INTO users_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
    VALUES (
        NEW.id,
        'My Profile',
        'profile',
        'View and edit your profile',
        false,
        true,
        2
    );

    INSERT INTO users_pages (site_id, title, slug, meta_description, is_default, is_published, display_order)
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
