-- Create events table to store custom events for each site
CREATE TABLE IF NOT EXISTS events (
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
CREATE INDEX IF NOT EXISTS idx_events_site_id ON events(site_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_display_order ON events(display_order);
CREATE INDEX IF NOT EXISTS idx_events_is_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Add unique constraint for slug per site
ALTER TABLE events ADD CONSTRAINT unique_events_slug_per_site UNIQUE (site_id, slug);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies for events table
CREATE POLICY "Users can view their own site's events" ON events
    FOR SELECT USING (
        site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert events for their own sites" ON events
    FOR INSERT WITH CHECK (
        site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own site's events" ON events
    FOR UPDATE USING (
        site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own site's events" ON events
    FOR DELETE USING (
        site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    );

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_events_updated_at();