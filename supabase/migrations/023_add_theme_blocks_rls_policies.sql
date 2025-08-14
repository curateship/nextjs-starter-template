-- Add Row Level Security policies for theme_blocks table
-- This migration secures the theme_blocks table to prevent unauthorized access

-- Enable RLS on theme_blocks table to enforce access control
ALTER TABLE theme_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view blocks for active themes
CREATE POLICY "Authenticated users can view active theme blocks" ON theme_blocks
    FOR SELECT USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM themes 
            WHERE themes.id = theme_blocks.theme_id 
            AND themes.status = 'active'
        )
    );

-- Policy: Public can view blocks for active themes (for frontend display)
CREATE POLICY "Public can view active theme blocks" ON theme_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM themes 
            WHERE themes.id = theme_blocks.theme_id 
            AND themes.status = 'active'
        )
    );

-- Policy: Only admins can create theme blocks
CREATE POLICY "Admins can create theme blocks" ON theme_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- Policy: Only admins can update theme blocks
CREATE POLICY "Admins can update theme blocks" ON theme_blocks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );

-- Policy: Only admins can delete theme blocks
CREATE POLICY "Admins can delete theme blocks" ON theme_blocks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );