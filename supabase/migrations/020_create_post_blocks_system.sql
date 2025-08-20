-- Create post blocks system for storing post content blocks
-- This enables the Post Builder to save and retrieve block content for posts

-- Create post_blocks table to store block content for each post
CREATE TABLE IF NOT EXISTS post_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('post-hero', 'post-content', 'post-gallery', 'post-quote', 'post-cta')),
    content JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_post_blocks_post_id ON post_blocks(post_id);
CREATE INDEX IF NOT EXISTS idx_post_blocks_type ON post_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_post_blocks_active ON post_blocks(is_active) WHERE is_active = true;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_post_blocks_post_active ON post_blocks(post_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_post_blocks_post_order ON post_blocks(post_id, display_order);

-- Create updated_at trigger
CREATE TRIGGER update_post_blocks_updated_at BEFORE UPDATE ON post_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON post_blocks TO authenticated;