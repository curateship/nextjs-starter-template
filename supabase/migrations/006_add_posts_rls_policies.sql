-- Add Row Level Security policies for posts table
-- This ensures users can only access posts from sites they own

-- Enable RLS on posts table
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can select posts from sites they own
CREATE POLICY "Users can view posts from their sites" ON posts
    FOR SELECT USING (
        site_id IN (
            SELECT id FROM sites 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can insert posts to sites they own
CREATE POLICY "Users can create posts in their sites" ON posts
    FOR INSERT WITH CHECK (
        site_id IN (
            SELECT id FROM sites 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update posts from sites they own
CREATE POLICY "Users can update posts in their sites" ON posts
    FOR UPDATE USING (
        site_id IN (
            SELECT id FROM sites 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can delete posts from sites they own
CREATE POLICY "Users can delete posts from their sites" ON posts
    FOR DELETE USING (
        site_id IN (
            SELECT id FROM sites 
            WHERE user_id = auth.uid()
        )
    );