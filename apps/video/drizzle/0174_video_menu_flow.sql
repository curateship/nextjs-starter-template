-- Flow gets its own link in the left menu, /admin/video-flow, straight after
-- the top-level Video editor link (workspace/tasks/flow/01-flow-dashboard.md,
-- part 1). Admins only, as Video editor is.
--
-- Written the way 0123 adds Carousel exports. Only a top-level Video editor
-- link gets Flow beside it. A menu that already has the link is left alone,
-- and a menu with no top-level Video editor link gets nothing.
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
              SELECT jsonb_agg(item ORDER BY entry_order, part)
              FROM jsonb_array_elements(section->'entries')
                WITH ORDINALITY AS entries(entry, entry_order)
              CROSS JOIN LATERAL (
                SELECT 0 AS part, entry AS item
                UNION ALL
                SELECT 1, jsonb_build_object(
                  'id', 'item-video-flow',
                  'href', '/admin/video-flow',
                  'icon', 'workflow',
                  'type', 'item',
                  'label', 'Flow',
                  'roles', jsonb_build_array('admin'),
                  'visible', true
                )
                WHERE entry->>'href' = '/admin/video-editor'
              ) AS entry_rows
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
  WHERE workspaces.settings::text LIKE '%"/admin/video-editor"%'
    AND workspaces.settings::text NOT LIKE '%/admin/video-flow%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
