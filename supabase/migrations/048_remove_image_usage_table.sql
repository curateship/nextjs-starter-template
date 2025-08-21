-- Remove image usage tracking system completely
-- Migration: 048_remove_image_usage_table

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

-- Note: Images now only track their own metadata without complex usage tracking
-- This simplifies the system and follows the "simplicity first" principle