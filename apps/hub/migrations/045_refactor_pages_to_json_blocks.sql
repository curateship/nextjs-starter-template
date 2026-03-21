-- Migration: Refactor pages from relational page_blocks to JSON content_blocks
-- Date: 2025-08-21
-- Purpose: Improve performance and scalability by using JSON storage for page blocks

-- Step 1: Add content_blocks JSONB column to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '{}';

-- Step 2: Migrate existing page_blocks data to JSON format (if table exists)
-- Just migrate the essential data without the problematic is_active column
DO $$
BEGIN
    -- Check if page_blocks table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'page_blocks') THEN
        -- Simple migration - just get the essential block data
        UPDATE pages p
        SET content_blocks = (
            SELECT jsonb_object_agg(
                pb.id, 
                jsonb_build_object(
                    'id', pb.id,
                    'type', pb.block_type,
                    'content', pb.content,
                    'display_order', COALESCE(pb.display_order, 0),
                    'created_at', COALESCE(pb.created_at, NOW()),
                    'updated_at', COALESCE(pb.updated_at, NOW())
                )
            )
            FROM page_blocks pb
            WHERE pb.site_id = p.site_id 
            AND pb.page_slug = p.slug
        )
        WHERE EXISTS (
            SELECT 1 FROM page_blocks pb 
            WHERE pb.site_id = p.site_id 
            AND pb.page_slug = p.slug
        );
    END IF;
END $$;

-- Step 3: Create index for JSON queries
CREATE INDEX IF NOT EXISTS idx_pages_content_blocks 
ON pages USING gin (content_blocks);

-- Step 4: Add comment explaining the structure
COMMENT ON COLUMN pages.content_blocks IS 'JSON storage for page blocks. Structure: { "block-id": { "id", "type", "content", "display_order", "created_at", "updated_at" } }';

-- Note: The page_blocks table will be dropped in a separate migration after verifying the data migration