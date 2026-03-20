-- Create themes table for storing theme metadata
-- This table manages all available themes in the system

CREATE TABLE IF NOT EXISTS themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'development')),
    template_path VARCHAR(500) NOT NULL,
    preview_image VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index on name to prevent duplicate theme names
CREATE UNIQUE INDEX IF NOT EXISTS idx_themes_name ON themes(name);

-- Create index on status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_themes_status ON themes(status);

-- Create updated_at trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_themes_updated_at BEFORE UPDATE ON themes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default marketplace theme
INSERT INTO themes (name, description, template_path, status, preview_image) VALUES 
('Marketplace', 'Modern marketplace theme with hero, product grid, blog posts and FAQ sections', '/themes/marketplace', 'active', '/images/themes/marketplace-preview.png')
ON CONFLICT (name) DO NOTHING;