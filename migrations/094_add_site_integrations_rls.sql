-- Add Row Level Security (RLS) policies to site_integrations table
-- This ensures users can only access integrations for their own sites

-- Enable RLS
ALTER TABLE site_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view integrations for their own sites
CREATE POLICY "Users can view integrations for their own sites" ON site_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = site_integrations.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can insert integrations for their own sites
CREATE POLICY "Users can insert integrations for their own sites" ON site_integrations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = site_integrations.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can update integrations for their own sites
CREATE POLICY "Users can update integrations for their own sites" ON site_integrations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = site_integrations.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Users can delete integrations for their own sites
CREATE POLICY "Users can delete integrations for their own sites" ON site_integrations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = site_integrations.site_id
            AND sites.user_id = auth.uid()
        )
    );
