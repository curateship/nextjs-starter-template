-- Secure database views by recreating them with security_invoker
-- This ensures views respect the RLS policies of underlying tables

-- Drop and recreate site_details view with security invoker
DROP VIEW IF EXISTS site_details CASCADE;
CREATE VIEW site_details WITH (security_invoker = true) AS
SELECT 
    s.id,
    s.user_id,
    s.name,
    s.description,
    s.subdomain,
    s.custom_domain,
    s.status,
    s.settings,
    s.created_at,
    s.updated_at,
    t.id as theme_id,
    t.name as theme_name,
    t.description as theme_description,
    t.preview_image,
    t.metadata as theme_metadata
FROM sites s
LEFT JOIN themes t ON s.theme_id = t.id;

-- Drop and recreate page_details view with security invoker
DROP VIEW IF EXISTS page_details CASCADE;
CREATE VIEW page_details WITH (security_invoker = true) AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    (
        SELECT COUNT(*)
        FROM site_blocks sb 
        WHERE sb.site_id = p.site_id 
        AND sb.page_slug = p.slug 
        AND sb.is_active = true
    ) as block_count
FROM pages p
JOIN sites s ON p.site_id = s.id;

-- Drop and recreate product_details view with security invoker
DROP VIEW IF EXISTS product_details CASCADE;
CREATE VIEW product_details WITH (security_invoker = true) AS
SELECT 
    p.*,
    s.name as site_name,
    s.subdomain,
    s.user_id,
    COUNT(pb.id) as block_count
FROM products p
LEFT JOIN sites s ON p.site_id = s.id
LEFT JOIN product_blocks pb ON p.id = pb.product_id AND pb.is_active = true
GROUP BY p.id, s.name, s.subdomain, s.user_id;

-- Drop and recreate image_details view with security invoker
DROP VIEW IF EXISTS image_details CASCADE;
CREATE VIEW image_details WITH (security_invoker = true) AS
SELECT 
  i.*,
  COALESCE(usage_stats.usage_count, 0) as usage_count,
  COALESCE(usage_stats.sites_using, 0) as sites_using
FROM images i
LEFT JOIN (
  SELECT 
    image_id,
    COUNT(*) as usage_count,
    COUNT(DISTINCT site_id) as sites_using
  FROM image_usage
  GROUP BY image_id
) usage_stats ON i.id = usage_stats.image_id;

-- Grant SELECT permissions to authenticated users on views
GRANT SELECT ON site_details TO authenticated;
GRANT SELECT ON page_details TO authenticated;
GRANT SELECT ON product_details TO authenticated;
GRANT SELECT ON image_details TO authenticated;

-- Note: With security_invoker = true, these views will now properly
-- respect the RLS policies of the underlying tables (sites, pages, products, themes, images).
-- This means users will only see data they're authorized to access based on table-level RLS.