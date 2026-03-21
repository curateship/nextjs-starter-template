-- Create directories table to store custom directories for each site
CREATE TABLE IF NOT EXISTS directories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    meta_description TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    content_blocks JSONB DEFAULT '{}',
    featured_image TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_directories_site_id ON directories(site_id);
CREATE INDEX IF NOT EXISTS idx_directories_slug ON directories(slug);
CREATE INDEX IF NOT EXISTS idx_directories_display_order ON directories(display_order);

-- Create unique constraint for slug per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_directories_site_slug ON directories(site_id, slug);

-- Enable RLS
ALTER TABLE directories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view directories from their own sites
CREATE POLICY "Users can view their own site directories" ON directories
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = directories.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can create directories for their own sites
CREATE POLICY "Users can create directories for their sites" ON directories
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = directories.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can update directories on their own sites
CREATE POLICY "Users can update their own site directories" ON directories
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = directories.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can delete directories from their own sites
CREATE POLICY "Users can delete their own site directories" ON directories
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites
            WHERE sites.id = directories.site_id
            AND sites.user_id = auth.uid()
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_directories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER directories_updated_at_trigger
    BEFORE UPDATE ON directories
    FOR EACH ROW
    EXECUTE FUNCTION update_directories_updated_at();