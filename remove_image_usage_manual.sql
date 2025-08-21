-- Manual script to remove image_usage table
-- Run this in Supabase SQL Editor

-- Drop the image_details view that depends on image_usage
DROP VIEW IF EXISTS image_details CASCADE;

-- Drop all image_usage related indexes
DROP INDEX IF EXISTS idx_image_usage_image_id;
DROP INDEX IF EXISTS idx_image_usage_site_id;

-- Drop the image_usage table completely
DROP TABLE IF EXISTS image_usage CASCADE;

-- Recreate image_details view without usage tracking
CREATE OR REPLACE VIEW image_details WITH (security_invoker = true) AS
SELECT 
  i.*
FROM images i;

-- Grant SELECT permissions to authenticated users on the view
GRANT SELECT ON image_details TO authenticated;