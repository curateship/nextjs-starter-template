-- Add Row Level Security policies for page_blocks table
-- This migration secures the page_blocks table to prevent unauthorized access

-- Drop any existing policies from when this table was called site_blocks
DROP POLICY IF EXISTS "Users can view their own site blocks" ON page_blocks;
DROP POLICY IF EXISTS "Users can create blocks for their sites" ON page_blocks;
DROP POLICY IF EXISTS "Users can update their site blocks" ON page_blocks;
DROP POLICY IF EXISTS "Users can delete their site blocks" ON page_blocks;
DROP POLICY IF EXISTS "Public can view active blocks for published sites" ON page_blocks;
DROP POLICY IF EXISTS "Admins can manage all site blocks" ON page_blocks;

-- Enable RLS on page_blocks table to enforce access control
ALTER TABLE page_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view blocks for their own sites
CREATE POLICY "Users can view their own page blocks" ON page_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = page_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can create blocks for their own sites
CREATE POLICY "Users can create blocks for their sites" ON page_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = page_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can update blocks for their own sites
CREATE POLICY "Users can update their page blocks" ON page_blocks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = page_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can delete blocks from their own sites
CREATE POLICY "Users can delete their page blocks" ON page_blocks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = page_blocks.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Public can view active blocks for published sites (for frontend display)
CREATE POLICY "Public can view active blocks for published sites" ON page_blocks
    FOR SELECT USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = page_blocks.site_id 
            AND sites.status = 'active'
        )
    );

-- Policy: Admins have full access to all page blocks
CREATE POLICY "Admins can manage all page blocks" ON page_blocks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );