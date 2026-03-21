-- Remove template field from pages table
-- This field was added but is not needed for current functionality

-- First, drop the view that depends on the pages table
DROP VIEW IF EXISTS page_details;

-- Drop the template column from pages table
ALTER TABLE pages 
DROP COLUMN IF EXISTS template;

-- Recreate the view without the template field
CREATE OR REPLACE VIEW page_details AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    (
        SELECT COUNT(*)
        FROM page_blocks sb 
        WHERE sb.site_id = p.site_id 
        AND sb.page_slug = p.slug 
        AND sb.is_active = true
    ) as block_count
FROM pages p
JOIN sites s ON p.site_id = s.id;

-- Grant necessary permissions
GRANT SELECT ON page_details TO authenticated;