-- Remove site_details view - eliminate pointless indirection
-- Date: August 21, 2025
-- Purpose: Follow "simplicity first" principle by removing unnecessary view

-- Drop the site_details view
DROP VIEW IF EXISTS site_details CASCADE;

-- Note: Replaced with direct queries to sites table with themes JOIN
-- This eliminates unnecessary indirection and follows the same pattern
-- we used for removing image_details and theme_blocks tables
-- 
-- Old: FROM site_details
-- New: FROM sites s JOIN themes t ON s.theme_id = t.id
--
-- Benefits:
-- - Clearer what data is being queried
-- - No view maintenance overhead
-- - Eliminates confusing RLS "*Unrestricted" badge
-- - Follows Load → Edit → Save pattern