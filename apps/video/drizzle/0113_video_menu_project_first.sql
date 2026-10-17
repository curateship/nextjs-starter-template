-- First frames and AI clips are made inside a project now, on the editor's
-- AI clip panel, so their two pages and their menu links go. Actors stays,
-- because an actor is shared across projects. Matched by address rather than
-- id, so a link somebody re-made by hand goes too.
WITH rebuilt AS (
  SELECT
    workspaces.id,
    jsonb_set(
      workspaces.settings,
      '{sections}',
      (
        SELECT jsonb_agg(
          jsonb_set(
            section,
            '{entries}',
            COALESCE((
              SELECT jsonb_agg(
                CASE
                  WHEN entry ? 'children' THEN
                    jsonb_set(
                      entry,
                      '{children}',
                      COALESCE(
                        (
                          SELECT jsonb_agg(child ORDER BY child_order)
                          FROM jsonb_array_elements(entry->'children')
                            WITH ORDINALITY AS children(child, child_order)
                          WHERE COALESCE(child->>'href', '') NOT IN (
                            '/admin/video-editor/first-frames',
                            '/admin/video-editor/generations'
                          )
                        ),
                        '[]'::jsonb
                      ),
                      true
                    )
                  ELSE entry
                END
                ORDER BY entry_order
              )
              FROM jsonb_array_elements(section->'entries')
                WITH ORDINALITY AS entries(entry, entry_order)
              WHERE COALESCE(entry->>'href', '') NOT IN (
                '/admin/video-editor/first-frames',
                '/admin/video-editor/generations'
              )
            ), '[]'::jsonb),
            true
          )
          ORDER BY section_order
        )
        FROM jsonb_array_elements(workspaces.settings->'sections')
          WITH ORDINALITY AS sections(section, section_order)
      ),
      true
    ) AS settings
  FROM workspaces
  WHERE workspaces.settings::text LIKE '%/admin/video-editor/first-frames%'
     OR workspaces.settings::text LIKE '%/admin/video-editor/generations%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
