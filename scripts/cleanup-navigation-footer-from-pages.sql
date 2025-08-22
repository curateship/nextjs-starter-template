-- Cleanup Script: Remove navigation and footer blocks from pages.content_blocks
-- Date: August 22, 2025
-- 
-- This script removes navigation and footer blocks from pages.content_blocks
-- after they have been migrated to sites.settings.navigation and sites.settings.footer

-- Function to remove navigation and footer blocks from JSON content_blocks
-- This preserves all other blocks while removing only navigation/footer types
UPDATE pages 
SET content_blocks = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(content_blocks::jsonb) 
  WHERE (value->>'type')::text NOT IN ('navigation', 'footer')
)
WHERE content_blocks IS NOT NULL
AND content_blocks::jsonb ? 'navigation' 
OR content_blocks::jsonb ? 'footer'
OR EXISTS (
  SELECT 1 
  FROM jsonb_each(content_blocks::jsonb) AS block 
  WHERE (block.value->>'type')::text IN ('navigation', 'footer')
);

-- Verification query to check cleanup results
-- Run this to see what was cleaned up:
-- SELECT 
--   p.id,
--   p.title,
--   p.slug,
--   s.name as site_name,
--   CASE 
--     WHEN p.content_blocks IS NULL THEN 'NULL'
--     WHEN p.content_blocks::text = '{}' THEN 'EMPTY'
--     ELSE jsonb_pretty(p.content_blocks::jsonb)
--   END as remaining_blocks,
--   CASE WHEN s.settings->>'navigation' IS NOT NULL THEN 'YES' ELSE 'NO' END as has_site_navigation,
--   CASE WHEN s.settings->>'footer' IS NOT NULL THEN 'YES' ELSE 'NO' END as has_site_footer
-- FROM pages p
-- JOIN sites s ON p.site_id = s.id
-- WHERE p.is_published = true
-- ORDER BY s.name, p.slug;

-- Summary query to show cleanup results
-- SELECT 
--   COUNT(*) as total_pages,
--   COUNT(CASE WHEN content_blocks IS NOT NULL AND content_blocks::text != '{}' THEN 1 END) as pages_with_remaining_blocks,
--   COUNT(CASE WHEN content_blocks IS NULL OR content_blocks::text = '{}' THEN 1 END) as pages_with_no_blocks
-- FROM pages;