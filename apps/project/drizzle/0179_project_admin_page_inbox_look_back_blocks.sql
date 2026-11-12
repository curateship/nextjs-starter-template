-- The site admin's inbox and Look back leave the left panel's header, where a
-- tray and a graph swapped the page for them, and become "/" blocks on their
-- own My dashboard page (Tyler, 11 Nov 2026: "turn look back and inbox tabs
-- into blocks"). Every site admin's page gets the Inbox and Look back blocks
-- at its end, so neither goes missing; a page already holding one keeps it
-- and gets only the other. Only a page saved as a block document, or an empty
-- one, is changed: one saved as plain words is left alone, so it is never
-- read as JSON here.
UPDATE "project_site_admin_prefs"
SET "notes" = CASE
    WHEN "notes" = '' THEN '{"type":"doc","content":[{"type":"noteInbox"},{"type":"noteLookBack"}]}'
    ELSE jsonb_set(
      "notes"::jsonb,
      '{content}',
      COALESCE("notes"::jsonb -> 'content', '[]'::jsonb)
        || CASE WHEN "notes" LIKE '%"noteInbox"%' THEN '[]'::jsonb ELSE '[{"type":"noteInbox"}]'::jsonb END
        || CASE WHEN "notes" LIKE '%"noteLookBack"%' THEN '[]'::jsonb ELSE '[{"type":"noteLookBack"}]'::jsonb END
    )::text
  END
WHERE "notes" = ''
   OR ("notes" ~ '^\{\s*"type"\s*:\s*"doc"' AND ("notes" NOT LIKE '%"noteInbox"%' OR "notes" NOT LIKE '%"noteLookBack"%'));
