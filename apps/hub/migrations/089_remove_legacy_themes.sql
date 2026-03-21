-- Remove trigger that validates theme on site creation
DROP TRIGGER IF EXISTS validate_site_theme_active ON sites;
DROP FUNCTION IF EXISTS validate_active_theme();

-- Remove the copy_theme_blocks_to_site RPC
DROP FUNCTION IF EXISTS copy_theme_blocks_to_site(UUID, UUID);

-- Drop FK and column from sites
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_theme_id_fkey;
ALTER TABLE sites DROP COLUMN IF EXISTS theme_id;

-- Drop themes table
DROP TABLE IF EXISTS themes;
