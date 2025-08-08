-- Setup Row Level Security (RLS) policies and additional constraints
-- This ensures proper data access control and security

-- Enable Row Level Security on all tables
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_customizations ENABLE ROW LEVEL SECURITY;

-- Themes policies (only admins can modify, everyone can read active themes)
CREATE POLICY "Public read access to active themes" ON themes
    FOR SELECT USING (status = 'active');

CREATE POLICY "Admin full access to themes" ON themes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- Sites policies (users can only access their own sites)
CREATE POLICY "Users can view their own sites" ON sites
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sites" ON sites
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sites" ON sites
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sites" ON sites
    FOR DELETE USING (auth.uid() = user_id);

-- Admin can view all sites
CREATE POLICY "Admins can view all sites" ON sites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- Site customizations policies (users can only access customizations for their own sites)
CREATE POLICY "Users can view customizations for their own sites" ON site_customizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_customizations.site_id 
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert customizations for their own sites" ON site_customizations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_customizations.site_id 
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update customizations for their own sites" ON site_customizations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_customizations.site_id 
            AND sites.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete customizations for their own sites" ON site_customizations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_customizations.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Admin can view all customizations
CREATE POLICY "Admins can view all customizations" ON site_customizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- Create view for site details with theme information
CREATE OR REPLACE VIEW site_details AS
SELECT 
    s.id,
    s.user_id,
    s.name,
    s.description,
    s.subdomain,
    s.custom_domain,
    s.status,
    s.settings,
    s.created_at,
    s.updated_at,
    t.id as theme_id,
    t.name as theme_name,
    t.description as theme_description,
    t.template_path,
    t.preview_image,
    t.metadata as theme_metadata
FROM sites s
JOIN themes t ON s.theme_id = t.id;

-- Create view for active site customizations with site info
CREATE OR REPLACE VIEW active_site_customizations AS
SELECT 
    sc.id,
    sc.site_id,
    sc.page_path,
    sc.block_type,
    sc.block_identifier,
    sc.customizations,
    sc.version,
    sc.created_at,
    sc.updated_at,
    s.user_id,
    s.name as site_name,
    s.subdomain,
    s.status as site_status
FROM site_customizations sc
JOIN sites s ON sc.site_id = s.id
WHERE sc.is_active = true;

-- Grant necessary permissions for views
GRANT SELECT ON site_details TO authenticated;
GRANT SELECT ON active_site_customizations TO authenticated;

-- Create function to check if user owns a site (useful for additional security checks)
CREATE OR REPLACE FUNCTION user_owns_site(site_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM sites 
        WHERE id = site_id 
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's site count (for potential limits)
CREATE OR REPLACE FUNCTION get_user_site_count(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM sites 
        WHERE user_id = p_user_id 
        AND status != 'deleted'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate theme is active before site creation
CREATE OR REPLACE FUNCTION validate_active_theme()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if theme exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM themes 
        WHERE id = NEW.theme_id 
        AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Theme must be active to be assigned to a site';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate theme is active when creating/updating sites
CREATE TRIGGER validate_site_theme_active
    BEFORE INSERT OR UPDATE OF theme_id ON sites
    FOR EACH ROW
    EXECUTE FUNCTION validate_active_theme();

-- Create function to clean up inactive customizations (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_customizations(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete inactive customizations older than specified days
    -- Keep at least the 5 most recent versions for rollback capability
    DELETE FROM site_customizations 
    WHERE is_active = false 
        AND created_at < NOW() - INTERVAL '%s days' % days_old
        AND id NOT IN (
            SELECT id FROM (
                SELECT id, 
                    ROW_NUMBER() OVER (
                        PARTITION BY site_id, page_path, block_type, block_identifier 
                        ORDER BY version DESC
                    ) as rn
                FROM site_customizations 
                WHERE is_active = false
            ) ranked 
            WHERE rn <= 5
        );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;