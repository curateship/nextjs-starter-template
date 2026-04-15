-- Stop auto-creating user pages and remove untouched seed pages that only existed
-- to back the old /user-dashboard system.

DROP TRIGGER IF EXISTS create_default_dashboard_trigger ON sites;
DROP FUNCTION IF EXISTS create_default_dashboard_for_site();

UPDATE site_dashboard_pages
SET content_blocks = COALESCE((
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(content_blocks) AS blocks(key, value)
  WHERE COALESCE(value->>'type', '') <> 'user-profile'
), '{}'::jsonb)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_each(content_blocks) AS blocks(key, value)
  WHERE value->>'type' = 'user-profile'
);

DELETE FROM site_dashboard_pages
WHERE (content_blocks IS NULL OR content_blocks = '{}'::jsonb)
  AND (
    (slug = 'home' AND title = 'Dashboard Home' AND COALESCE(meta_description, '') = 'Your personal dashboard')
    OR
    (slug = 'profile' AND title = 'My Profile' AND COALESCE(meta_description, '') = 'View and edit your profile')
    OR
    (slug = 'settings' AND title = 'Settings' AND COALESCE(meta_description, '') = 'Manage your account settings')
  );
