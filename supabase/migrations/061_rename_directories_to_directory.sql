-- Rename directories table to directory (singular) since it's one directory with many items
ALTER TABLE directories RENAME TO directory;

-- Update indexes to match new table name
DROP INDEX IF EXISTS idx_directories_site_id;
DROP INDEX IF EXISTS idx_directories_slug;
DROP INDEX IF EXISTS idx_directories_display_order;

CREATE INDEX IF NOT EXISTS idx_directory_site_id ON directory(site_id);
CREATE INDEX IF NOT EXISTS idx_directory_slug ON directory(slug);
CREATE INDEX IF NOT EXISTS idx_directory_display_order ON directory(display_order);

-- Update triggers if any exist
-- (The updated_at trigger will automatically work with the renamed table)