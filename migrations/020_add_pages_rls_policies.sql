-- Add Row Level Security policies for pages table
-- This migration secures the pages table to prevent unauthorized access

-- Enable RLS on pages table to enforce access control
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view pages from their own sites
CREATE POLICY "Users can view their own site pages" ON pages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = pages.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can create pages for their own sites
CREATE POLICY "Users can create pages for their sites" ON pages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = pages.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can update pages for their own sites
CREATE POLICY "Users can update their site pages" ON pages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = pages.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can delete pages from their own sites
CREATE POLICY "Users can delete their site pages" ON pages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = pages.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Public users can view published pages (for frontend display)
-- This allows the frontend to display published pages without authentication
CREATE POLICY "Public can view published pages" ON pages
    FOR SELECT USING (is_published = true);

-- Policy: Admins have full access to all pages
CREATE POLICY "Admins can manage all pages" ON pages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );