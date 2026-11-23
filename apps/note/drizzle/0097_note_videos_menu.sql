-- A "Videos" link in the left menu, open to every signed-in member, not
-- admins only (Tyler, 17 Oct 2026). Every saved left menu gets it in its first
-- section, right after that section's first entry: each site's admin menu,
-- saved on its workspace, and the one members' menu, saved app-wide. A menu
-- that already links to /videos anywhere is left alone, and so is a menu that
-- has never been saved, because there is nothing to add it to yet.
--
-- `/videos` is not under `/admin`, so the sidebar shows it to a member
-- (`canSeeShellEntry` in `src/lib/custom-shell.tsx` hides only admin
-- addresses and links limited to other roles).

UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections,0,entries}',
  jsonb_insert(
    "settings" #> '{sections,0,entries}',
    '{0}',
    '{"type":"item","id":"item-note-videos","href":"/videos","label":"Videos","icon":"video","visible":true}'::jsonb,
    true
  )
)
WHERE jsonb_typeof("settings"->'sections') = 'array'
  AND jsonb_array_length("settings"->'sections') > 0
  AND jsonb_typeof("settings" #> '{sections,0,entries}') = 'array'
  AND NOT jsonb_path_exists("settings", '$.sections[*].entries[*] ? (@.href == "/videos")')
  AND NOT jsonb_path_exists("settings", '$.sections[*].entries[*].children[*] ? (@.href == "/videos")');

UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{memberSections,0,entries}',
  jsonb_insert(
    "settings" #> '{memberSections,0,entries}',
    '{0}',
    '{"type":"item","id":"item-note-videos","href":"/videos","label":"Videos","icon":"video","visible":true}'::jsonb,
    true
  )
)
WHERE jsonb_typeof("settings"->'memberSections') = 'array'
  AND jsonb_array_length("settings"->'memberSections') > 0
  AND jsonb_typeof("settings" #> '{memberSections,0,entries}') = 'array'
  AND NOT jsonb_path_exists("settings", '$.memberSections[*].entries[*] ? (@.href == "/videos")')
  AND NOT jsonb_path_exists("settings", '$.memberSections[*].entries[*].children[*] ? (@.href == "/videos")');
