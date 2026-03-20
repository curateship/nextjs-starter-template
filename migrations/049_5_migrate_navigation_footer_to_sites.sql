-- Migration: Move navigation and footer from pages.content_blocks to sites.settings
-- Date: August 22, 2025
-- 
-- This script migrates existing navigation/footer blocks from home pages to sites.settings JSON

-- Step 1: Migrate navigation and footer data from home pages to sites.settings
-- This finds navigation/footer blocks in home page content_blocks and moves them to sites.settings
UPDATE sites 
SET settings = (COALESCE(settings::jsonb, '{}'::jsonb) || jsonb_build_object(
  'navigation', (
    SELECT (page_blocks.value->>'content')::json
    FROM pages p,
    LATERAL json_each(p.content_blocks::json) as page_blocks(key, value)
    WHERE p.site_id = sites.id 
    AND p.is_homepage = true 
    AND p.is_published = true
    AND (page_blocks.value->>'type')::text = 'navigation'
    LIMIT 1
  ),
  'footer', (
    SELECT (page_blocks.value->>'content')::json
    FROM pages p,
    LATERAL json_each(p.content_blocks::json) as page_blocks(key, value)
    WHERE p.site_id = sites.id 
    AND p.is_homepage = true 
    AND p.is_published = true
    AND (page_blocks.value->>'type')::text = 'footer'
    LIMIT 1
  )
))::json
WHERE EXISTS (
  SELECT 1 FROM pages p 
  WHERE p.site_id = sites.id 
  AND p.is_homepage = true 
  AND p.is_published = true
  AND p.content_blocks IS NOT NULL
);

-- Step 2: Verify migration results
-- Run this to check what was migrated:
-- SELECT id, name, 
--        CASE WHEN settings->>'navigation' IS NOT NULL THEN 'YES' ELSE 'NO' END as has_navigation,
--        CASE WHEN settings->>'footer' IS NOT NULL THEN 'YES' ELSE 'NO' END as has_footer,
--        settings
-- FROM sites ORDER BY name;

-- Note: The actual removal of navigation/footer blocks from pages.content_blocks
-- will be done programmatically after verifying the migration worked correctly.