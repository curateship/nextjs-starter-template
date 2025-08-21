-- Remove image usage tracking system completely
-- Migration: 048_remove_image_usage_table

-- Drop the image_details view that depends on image_usage
DROP VIEW IF EXISTS image_details CASCADE;

-- Drop all image_usage related indexes
DROP INDEX IF EXISTS idx_image_usage_image_id;
DROP INDEX IF EXISTS idx_image_usage_site_id;

-- Drop the image_usage table completely
DROP TABLE IF EXISTS image_usage CASCADE;

-- Note: Completely eliminated image_details view as it was just a pointless 
-- wrapper around the images table. Direct table access is simpler and clearer.
-- This follows the "simplicity first" principle - no unnecessary indirection.