-- Add content_blocks JSONB column to posts table for structured content
-- This follows the same pattern as pages and products

-- Step 1: Add content_blocks column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '{}';

-- Step 2: Migrate existing content to content_blocks
UPDATE posts
SET content_blocks = jsonb_build_object(
    'block-' || gen_random_uuid()::text, jsonb_build_object(
        'id', 'block-' || gen_random_uuid()::text,
        'type', 'rich-text',
        'content', jsonb_build_object(
            'text', COALESCE(content, ''),
            'format', 'plain'
        ),
        'display_order', 1,
        'created_at', NOW(),
        'updated_at', NOW()
    )
)
WHERE content IS NOT NULL AND content != '';

-- Step 3: Add GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_posts_content_blocks_gin 
ON posts USING gin (content_blocks);

-- Step 4: Add index for specific block type queries (optional but useful)
CREATE INDEX IF NOT EXISTS idx_posts_content_blocks_rich_text 
ON posts USING gin ((content_blocks->'rich-text'));

-- Note: The old 'content' column will be removed in a future migration after testing