-- Migration: Drop page_blocks table after migration to JSON content_blocks
-- Date: 2025-08-21
-- Purpose: Clean up old relational table now that page blocks are stored in JSON format

-- Step 1: Drop foreign key constraints (if any exist)
ALTER TABLE page_blocks DROP CONSTRAINT IF EXISTS page_blocks_site_id_fkey;

-- Step 2: Drop the page_blocks table entirely
DROP TABLE IF EXISTS page_blocks;

-- Step 3: Add comment documenting the migration
COMMENT ON COLUMN pages.content_blocks IS 'JSON storage for page blocks. Migrated from page_blocks table on 2025-08-21. Structure: { "block-id": { "id", "type", "content", "display_order", "created_at", "updated_at" } }';