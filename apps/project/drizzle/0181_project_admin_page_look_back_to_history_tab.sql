-- Look back leaves the site admin's own My dashboard page as a block of its own
-- and becomes the Daily habits block's History tab (Tyler, 13 Nov 2026: "Add 2 tabs here. First tab "Today"
-- second tab "History" move the "look back" block into the history tab"). The
-- "/" menu no longer offers it, so every Look back block on a page is deleted,
-- wherever it sits. Only a page saved as a block document is changed: one
-- saved as plain words is left alone, so it is never read as JSON here.
UPDATE "project_site_admin_prefs"
SET "notes" = jsonb_set(
    "notes"::jsonb,
    '{content}',
    COALESCE(
      (
        SELECT jsonb_agg(block ORDER BY position)
        FROM jsonb_array_elements("notes"::jsonb -> 'content') WITH ORDINALITY AS blocks(block, position)
        WHERE block ->> 'type' IS DISTINCT FROM 'noteLookBack'
      ),
      '[]'::jsonb
    )
  )::text
WHERE "notes" ~ '^\{\s*"type"\s*:\s*"doc"'
  AND "notes" LIKE '%"noteLookBack"%'
  AND jsonb_typeof("notes"::jsonb -> 'content') = 'array';
