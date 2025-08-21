-- Remove unused columns from images table
-- These columns are not used in the application and add unnecessary complexity

-- Remove width column
ALTER TABLE images DROP COLUMN IF EXISTS width;

-- Remove height column  
ALTER TABLE images DROP COLUMN IF EXISTS height;

-- Remove mime_type column (unused)
ALTER TABLE images DROP COLUMN IF EXISTS mime_type;