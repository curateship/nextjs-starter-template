-- Fix create_sample_site_for_user: remove theme_id reference
CREATE OR REPLACE FUNCTION create_sample_site_for_user(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_site_id UUID;
BEGIN
    INSERT INTO sites (user_id, name, description, subdomain, status, settings, is_template, created_at, updated_at)
    VALUES (
        p_user_id,
        'Sample Site',
        'A sample site to get you started',
        'sample-' || substring(p_user_id::text from 1 for 8),
        'draft',
        '{}',
        false,
        NOW(),
        NOW()
    )
    RETURNING id INTO new_site_id;

    -- Create sample product
    INSERT INTO products (site_id, title, slug, is_published, content_blocks, created_at, updated_at)
    VALUES (
        new_site_id,
        'Sample Product',
        'sample-product',
        true,
        '{}',
        NOW(),
        NOW()
    );

    RETURN new_site_id;
END;
$$;

-- Fix get_system_statistics: remove themes and site_customizations references
CREATE OR REPLACE FUNCTION get_system_statistics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_sites', (SELECT COUNT(*) FROM sites WHERE is_template = false),
        'active_sites', (SELECT COUNT(*) FROM sites WHERE status = 'active' AND is_template = false),
        'total_templates', (SELECT COUNT(*) FROM sites WHERE is_template = true),
        'sites_by_status', (
            SELECT json_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*) as count
                FROM sites
                WHERE is_template = false
                GROUP BY status
            ) site_stats
        )
    ) INTO result;

    RETURN result;
END;
$$;
