-- A project's left column follows the left panel standard, as in Project
-- (workspace/tasks/Projects/left-column-standards.md). Tyler, 5 Nov 2026:
-- "Left panel needs to use left panel standards, look at project app".

-- Lock description in the project's ⋮ menu (part 22): the description reads
-- only, for everyone, until Unlock description.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "description_locked" boolean NOT NULL DEFAULT false;

-- The pin in the project's header (part 7): a pinned project comes first in
-- the Projects table, whatever the sort. Null is not pinned.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;

-- The description is written in place in the editor now (part 4), so it holds
-- the editor's document as JSON, or "" for none. Each line of an old plain
-- description becomes one paragraph; an empty line stays an empty paragraph.
UPDATE "promo_projects"
SET "description" = (
  SELECT jsonb_build_object(
    'type', 'doc',
    'content', jsonb_agg(
      CASE
        WHEN line = '' THEN jsonb_build_object('type', 'paragraph')
        ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line)))
      END
      ORDER BY n
    )
  )::text
  FROM unnest(string_to_array(replace("description", E'\r', ''), E'\n')) WITH ORDINALITY AS lines(line, n)
)
WHERE btrim("description") <> '';

UPDATE "promo_projects" SET "description" = '' WHERE btrim("description") = '';
