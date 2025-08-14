-- Add Row Level Security policies for site_blocks table
-- This migration secures the site_blocks table to prevent unauthorized access

-- Enable RLS on site_blocks table to enforce access control
ALTER TABLE site_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view blocks for their own sites
CREATE POLICY "Users can view their own site blocks" ON site_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can create blocks for their own sites
CREATE POLICY "Users can create blocks for their sites" ON site_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can update blocks for their own sites
CREATE POLICY "Users can update their site blocks" ON site_blocks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can delete blocks from their own sites
CREATE POLICY "Users can delete their site blocks" ON site_blocks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Public can view active blocks for published sites (for frontend display)
CREATE POLICY "Public can view active blocks for published sites" ON site_blocks
    FOR SELECT USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = site_blocks.site_id 
            AND sites.status = 'active'
        )
    );

-- Policy: Admins have full access to all site blocks
CREATE POLICY "Admins can manage all site blocks" ON site_blocks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );