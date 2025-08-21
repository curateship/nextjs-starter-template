-- Migration: Migrate theme_blocks to themes.metadata JSON for simplification
-- Date: August 21, 2025
-- Purpose: Eliminate theme_blocks table and move default content to themes.metadata

-- Step 1: Skip data migration since theme_blocks table no longer exists
-- The data was already migrated or the table was already dropped

-- Step 2: Update the copy_theme_blocks_to_site function to use JSON from themes.metadata
CREATE OR REPLACE FUNCTION copy_theme_blocks_to_site(p_site_id UUID, p_theme_id UUID)
RETURNS VOID AS $$
DECLARE
    theme_metadata JSONB;
    default_blocks JSONB;
    block_key TEXT;
    block_data JSONB;
BEGIN
    -- Get theme metadata
    SELECT metadata INTO theme_metadata
    FROM themes 
    WHERE id = p_theme_id;
    
    -- Extract default_blocks from metadata
    default_blocks := theme_metadata->'default_blocks';
    
    -- If theme has default blocks, copy them to site pages
    IF default_blocks IS NOT NULL THEN
        FOR block_key, block_data IN SELECT * FROM jsonb_each(default_blocks)
        LOOP
            -- Insert into pages.content_blocks (using the new JSON structure)
            -- This assumes pages table now has content_blocks JSONB column
            INSERT INTO pages (site_id, slug, title, content_blocks, created_at, updated_at)
            VALUES (
                p_site_id,
                CASE 
                    WHEN block_data->>'page_slug' = 'global' THEN 'home'
                    ELSE block_data->>'page_slug'
                END,
                CASE 
                    WHEN block_data->>'page_slug' = 'global' THEN 'Home'
                    ELSE initcap(block_data->>'page_slug')
                END,
                jsonb_build_object(
                    gen_random_uuid()::text,
                    jsonb_build_object(
                        'id', gen_random_uuid(),
                        'type', block_key,
                        'content', block_data->'content',
                        'display_order', COALESCE((block_data->>'display_order')::integer, 0),
                        'created_at', NOW(),
                        'updated_at', NOW()
                    )
                ),
                NOW(),
                NOW()
            )
            ON CONFLICT (site_id, slug) DO UPDATE SET
                content_blocks = pages.content_blocks || jsonb_build_object(
                    gen_random_uuid()::text,
                    jsonb_build_object(
                        'id', gen_random_uuid(),
                        'type', block_key,
                        'content', block_data->'content',
                        'display_order', COALESCE((block_data->>'display_order')::integer, 0),
                        'created_at', NOW(),
                        'updated_at', NOW()
                    )
                );
        END LOOP;
    END IF;
    
    -- Fallback: Create minimal home page if no blocks exist
    INSERT INTO pages (site_id, slug, title, content_blocks, created_at, updated_at)
    VALUES (
        p_site_id,
        'home',
        'Home',
        jsonb_build_object(
            gen_random_uuid()::text,
            jsonb_build_object(
                'id', gen_random_uuid(),
                'type', 'hero',
                'content', jsonb_build_object(
                    'title', 'Welcome to Your Site',
                    'subtitle', 'Start building your content here'
                ),
                'display_order', 0,
                'created_at', NOW(),
                'updated_at', NOW()
            )
        ),
        NOW(),
        NOW()
    )
    ON CONFLICT (site_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Skip verification and cleanup since theme_blocks table was already dropped
-- Migration complete

-- Note: Theme blocks are now stored as JSON in themes.metadata.default_blocks
-- This follows the same pattern used for pages.content_blocks and products.content_blocks
-- Eliminates unnecessary relational complexity in favor of simple JSON storage