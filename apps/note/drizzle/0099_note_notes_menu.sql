-- A "Notes" link in the left menu, open to every signed-in member like
-- Videos (Tyler, 18 Oct 2026). It goes right after the Videos link wherever a
-- menu has one, and otherwise after the first entry of the first section, the
-- place 0097 used. Every saved menu gets it: each site's admin menu, saved on
-- its workspace, and the one members' menu, saved app-wide. A menu that
-- already links to /notes anywhere is left alone, and so is a menu never saved.
--
-- `/notes` is not under `/admin`, so the sidebar shows it to a member
-- (`canSeeShellEntry` in `src/lib/custom-shell.tsx` hides only admin
-- addresses and links limited to other roles).

WITH "spot" AS (
  SELECT
    w."id",
    coalesce(
      (
        SELECT ARRAY[(s."ord" - 1)::text, e."ord"::text]
        FROM jsonb_array_elements(w."settings"->'sections') WITH ORDINALITY AS s("section", "ord"),
          jsonb_array_elements(
            CASE WHEN jsonb_typeof(s."section"->'entries') = 'array' THEN s."section"->'entries' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e("entry", "ord")
        WHERE e."entry"->>'href' = '/videos'
        ORDER BY s."ord", e."ord"
        LIMIT 1
      ),
      ARRAY['0', '1']
    ) AS "at"
  FROM "workspaces" w
  WHERE jsonb_typeof(w."settings"->'sections') = 'array'
    AND jsonb_array_length(w."settings"->'sections') > 0
    AND jsonb_typeof(w."settings" #> '{sections,0,entries}') = 'array'
    AND NOT jsonb_path_exists(w."settings", '$.sections[*].entries[*] ? (@.href == "/notes")')
    AND NOT jsonb_path_exists(w."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/notes")')
)
UPDATE "workspaces" w
SET "settings" = jsonb_set(
  w."settings",
  ARRAY['sections', "spot"."at"[1], 'entries'],
  jsonb_insert(
    w."settings" #> ARRAY['sections', "spot"."at"[1], 'entries'],
    ARRAY["spot"."at"[2]],
    '{"type":"item","id":"item-note-notes","href":"/notes","label":"Notes","icon":"notebook-pen","visible":true}'::jsonb,
    false
  )
)
FROM "spot"
WHERE w."id" = "spot"."id";

WITH "spot" AS (
  SELECT
    t."key",
    coalesce(
      (
        SELECT ARRAY[(s."ord" - 1)::text, e."ord"::text]
        FROM jsonb_array_elements(t."settings"->'memberSections') WITH ORDINALITY AS s("section", "ord"),
          jsonb_array_elements(
            CASE WHEN jsonb_typeof(s."section"->'entries') = 'array' THEN s."section"->'entries' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS e("entry", "ord")
        WHERE e."entry"->>'href' = '/videos'
        ORDER BY s."ord", e."ord"
        LIMIT 1
      ),
      ARRAY['0', '1']
    ) AS "at"
  FROM "settings" t
  WHERE jsonb_typeof(t."settings"->'memberSections') = 'array'
    AND jsonb_array_length(t."settings"->'memberSections') > 0
    AND jsonb_typeof(t."settings" #> '{memberSections,0,entries}') = 'array'
    AND NOT jsonb_path_exists(t."settings", '$.memberSections[*].entries[*] ? (@.href == "/notes")')
    AND NOT jsonb_path_exists(t."settings", '$.memberSections[*].entries[*].children[*] ? (@.href == "/notes")')
)
UPDATE "settings" t
SET "settings" = jsonb_set(
  t."settings",
  ARRAY['memberSections', "spot"."at"[1], 'entries'],
  jsonb_insert(
    t."settings" #> ARRAY['memberSections', "spot"."at"[1], 'entries'],
    ARRAY["spot"."at"[2]],
    '{"type":"item","id":"item-note-notes","href":"/notes","label":"Notes","icon":"notebook-pen","visible":true}'::jsonb,
    false
  )
)
FROM "spot"
WHERE t."key" = "spot"."key";
