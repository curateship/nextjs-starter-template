-- Add divider block type to page_blocks table
-- This block provides custom spacing and visual dividers between sections

-- Drop the existing constraint
ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS page_blocks_block_type_check;

-- Add the updated constraint including 'divider'
ALTER TABLE page_blocks 
ADD CONSTRAINT page_blocks_block_type_check 
CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text', 'faq', 'listing-views', 'divider'));

-- Add comment explaining the divider block type
COMMENT ON COLUMN page_blocks.block_type IS 'Block types including divider for custom spacing and visual separation between sections';