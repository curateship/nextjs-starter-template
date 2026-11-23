-- Favourites gets its own page, /admin/video-favourites, and its own link in
-- the left menu as a sub-link of Viral (Tyler, 17 Oct 2026: "favorite is a
-- subnav of viral"). When Viral is a top-level link, Favourites becomes its
-- first child. When Viral is itself a child of another link, the menu has no
-- third level, so Favourites goes straight after it among those children.
-- A menu that already has the link is left alone.
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
                SELECT
                  0 AS part,
                  CASE
                    WHEN entry->>'href' = '/admin/video-viral' THEN
                      jsonb_set(
                        entry,
                        '{children}',
                        jsonb_build_array(
                          jsonb_build_object(
                            'id', 'item-video-favourites',
                            'href', '/admin/video-favourites',
                            'label', 'Favourites'
                          )
                        ) || COALESCE(entry->'children', '[]'::jsonb),
                        true
                      )
                    WHEN entry ? 'children' THEN
                      jsonb_set(
                        entry,
                        '{children}',
                        COALESCE((
                          SELECT jsonb_agg(child_item ORDER BY child_order, child_part)
                          FROM jsonb_array_elements(entry->'children')
                            WITH ORDINALITY AS children(child, child_order)
                          CROSS JOIN LATERAL (
                            SELECT 0 AS child_part, child AS child_item
                            UNION ALL
                            SELECT 1, jsonb_build_object(
                              'id', 'item-video-favourites',
                              'href', '/admin/video-favourites',
                              'label', 'Favourites'
                            )
                            WHERE child->>'href' = '/admin/video-viral'
                          ) AS child_rows
                        ), '[]'::jsonb),
                        true
                      )
                    ELSE entry
                  END AS item
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
  WHERE workspaces.settings::text LIKE '%"/admin/video-viral"%'
    AND workspaces.settings::text NOT LIKE '%/admin/video-favourites%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
