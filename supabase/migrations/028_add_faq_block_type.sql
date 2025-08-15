-- Add FAQ block type to page_blocks table
-- This migration adds 'faq' to the allowed block types for the page_blocks table
-- Note: The constraint still has the old name from when the table was called site_blocks

ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;

ALTER TABLE page_blocks 
ADD CONSTRAINT site_blocks_block_type_check 
CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text', 'faq'));