-- Carousel exports gets its own page, /admin/video-carousel-exports, and its
-- own link in the left menu as a sub-link of Carousels (Tyler, 19 Oct 2026:
-- "The carousel export should be on its own dashboard"). Kept carousel ZIPs
-- used to sit on the video Exports page; that page now lists video exports
-- only.
--
-- Written the way 0115 adds Favourites under Viral. When Carousels is a
-- top-level link, Exports becomes its last sub-link, after any it already has.
-- When Carousels is itself a sub-link of another link, the menu has no third
-- level, so Exports goes straight after it among those sub-links. A menu that
-- already has the link is left alone, and a menu with no Carousels link gets
-- nothing.
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
                    WHEN entry->>'href' = '/admin/video-carousels' THEN
                      jsonb_set(
                        entry,
                        '{children}',
                        COALESCE(entry->'children', '[]'::jsonb)
                          || jsonb_build_array(
                            jsonb_build_object(
                              'id', 'item-video-carousel-exports',
                              'href', '/admin/video-carousel-exports',
                              'label', 'Exports'
                            )
                          ),
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
                              'id', 'item-video-carousel-exports',
                              'href', '/admin/video-carousel-exports',
                              'label', 'Exports'
                            )
                            WHERE child->>'href' = '/admin/video-carousels'
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
  WHERE workspaces.settings::text LIKE '%"/admin/video-carousels"%'
    AND workspaces.settings::text NOT LIKE '%/admin/video-carousel-exports%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
