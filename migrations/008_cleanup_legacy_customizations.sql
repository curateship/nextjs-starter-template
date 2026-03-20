-- Cleanup legacy site customizations system
-- These tables were replaced by the page_blocks system in migration 006
-- and are no longer used in the codebase

-- Drop the view first (depends on the table)
DROP VIEW IF EXISTS active_site_customizations;

-- Drop the legacy functions
DROP FUNCTION IF EXISTS get_site_page_customizations(UUID, VARCHAR(255));
DROP FUNCTION IF EXISTS save_block_customization(UUID, VARCHAR(255), VARCHAR(100), VARCHAR(100), JSONB);
DROP FUNCTION IF EXISTS rollback_block_customization(UUID, VARCHAR(255), VARCHAR(100), VARCHAR(100), INTEGER);

-- Drop the legacy table and all its indexes/triggers
DROP TABLE IF EXISTS site_customizations CASCADE;

-- Note: The current system uses the page_blocks table (migration 006) 
-- which provides a cleaner, simpler approach to block management