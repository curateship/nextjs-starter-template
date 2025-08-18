-- Add listing-views block type to page_blocks table
-- This migration adds 'listing-views' to the allowed block types for dynamic content listings

ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE page_blocks 
ADD CONSTRAINT site_blocks_block_type_check 
CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text', 'faq', 'listing-views'));

-- Add comment explaining the new block type
COMMENT ON COLUMN page_blocks.block_type IS 'Block types including listing-views for dynamic product/content listings';