-- Put each asset factory under Video editor in every saved admin sidebar.
-- Existing child links are preserved after these product-owned dashboards.
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
            (
              SELECT jsonb_agg(
                CASE
                  WHEN entry->>'href' = '/admin/video-editor' THEN
                    jsonb_set(
                      entry,
                      '{children}',
                      jsonb_build_array(
                        jsonb_build_object(
                          'id', 'item-video-actors',
                          'label', 'Actors',
                          'href', '/admin/video-editor/actors'
                        ),
                        jsonb_build_object(
                          'id', 'item-video-first-frames',
                          'label', 'First frames',
                          'href', '/admin/video-editor/first-frames'
                        ),
                        jsonb_build_object(
                          'id', 'item-video-generations',
                          'label', 'AI videos',
                          'href', '/admin/video-editor/generations'
                        )
                      ) || COALESCE(
                        (
                          SELECT jsonb_agg(child ORDER BY child_order)
                          FROM jsonb_array_elements(
                            COALESCE(entry->'children', '[]'::jsonb)
                          ) WITH ORDINALITY AS children(child, child_order)
                          WHERE child->>'id' NOT IN (
                            'item-video-actors',
                            'item-video-first-frames',
                            'item-video-generations'
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
            ),
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
  WHERE workspaces.settings::text LIKE '%/admin/video-editor%'
)
UPDATE workspaces
SET settings = rebuilt.settings,
    updated_at = now()
FROM rebuilt
WHERE workspaces.id = rebuilt.id;
