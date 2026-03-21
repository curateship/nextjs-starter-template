-- Rename site_blocks table to page_blocks for better naming consistency
-- This improves clarity: pages → page_blocks, products → product_blocks

-- Rename the table
ALTER TABLE site_blocks RENAME TO page_blocks;

-- Rename indexes to match new table name
ALTER INDEX idx_site_blocks_site_id RENAME TO idx_page_blocks_site_id;
ALTER INDEX idx_site_blocks_active RENAME TO idx_page_blocks_active;
ALTER INDEX idx_site_blocks_nav_footer_unique RENAME TO idx_page_blocks_nav_footer_unique;

-- Update the trigger name
DROP TRIGGER IF EXISTS update_site_blocks_updated_at ON page_blocks;
CREATE TRIGGER update_page_blocks_updated_at BEFORE UPDATE ON page_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update constraint name
ALTER TABLE page_blocks RENAME CONSTRAINT site_blocks_page_slug_check TO page_blocks_page_slug_check;

-- Note: RLS policies will be updated in the next migration to reflect new naming