-- Remove unused preview_image column from themes table
-- Date: August 21, 2025
-- Purpose: Eliminate unused column following "simplicity first" principle

-- Drop the preview_image column
ALTER TABLE themes DROP COLUMN IF EXISTS preview_image;

-- Note: This column was never actually used in the UI and just added
-- unnecessary complexity to forms and queries. Following the same pattern
-- we used for removing meta_description from products table.