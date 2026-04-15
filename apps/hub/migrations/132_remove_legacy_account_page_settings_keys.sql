-- Rename the old default-blocks key to account_pages and drop obsolete
-- namespaced account page settings from sites.settings.

UPDATE sites
SET settings = jsonb_set(
  settings,
  ARRAY['default_blocks', 'account_pages'],
  settings->'default_blocks'->('user' || '_pages'),
  true
)
WHERE settings ? 'default_blocks'
  AND settings->'default_blocks' ? ('user' || '_pages')
  AND NOT (settings->'default_blocks' ? 'account_pages');

UPDATE sites
SET settings = jsonb_set(
  settings,
  ARRAY['default_blocks'],
  (settings->'default_blocks') - ('user' || '_pages'),
  true
)
WHERE settings ? 'default_blocks'
  AND settings->'default_blocks' ? ('user' || '_pages');

UPDATE sites
SET settings = settings - ('user' || '_pages')
WHERE settings ? ('user' || '_pages');
