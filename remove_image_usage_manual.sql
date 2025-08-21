-- Manual script to remove image_usage table
-- Run this in Supabase SQL Editor

-- Drop the image_details view that depends on image_usage
DROP VIEW IF EXISTS image_details CASCADE;

-- Drop all image_usage related indexes
DROP INDEX IF EXISTS idx_image_usage_image_id;
DROP INDEX IF EXISTS idx_image_usage_site_id;

-- Drop the image_usage table completely
DROP TABLE IF EXISTS image_usage CASCADE;

-- Note: Completely eliminated image_details view - it was just pointless indirection.
-- Code now queries the images table directly for better clarity and simplicity.