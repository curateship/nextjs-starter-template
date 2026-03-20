-- Remove unused template_path column from themes table
-- Date: August 21, 2025
-- Purpose: Eliminate unused column that stores static file paths

-- Drop the template_path column
ALTER TABLE themes DROP COLUMN IF EXISTS template_path;

-- Note: This column stored static file paths that don't need to be in the database.
-- Theme previews should be convention-based (theme name -> demo path) rather than stored.