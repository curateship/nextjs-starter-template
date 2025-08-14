-- Add rich-text block type to existing check constraints
-- This enables the creation of rich text content blocks

-- Update the theme_blocks table constraint to include rich-text
ALTER TABLE theme_blocks 
DROP CONSTRAINT IF EXISTS theme_blocks_block_type_check;

ALTER TABLE theme_blocks 
ADD CONSTRAINT theme_blocks_block_type_check 
CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text'));

-- Update the page_blocks table constraint to include rich-text  
ALTER TABLE page_blocks 
DROP CONSTRAINT IF EXISTS page_blocks_block_type_check;

ALTER TABLE page_blocks 
ADD CONSTRAINT page_blocks_block_type_check 
CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text'));

-- Note: rich-text blocks are typically added per-page, not as part of theme defaults
-- They are user-generated content blocks for specific page content needs