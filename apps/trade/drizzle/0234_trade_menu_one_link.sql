-- One Trade link in the left menu (Tyler, 8 Nov 2026: "One trade link", then
-- "if we're not using the old protocol links then just remove it"). The
-- trading overview and the exchange dashboards are one dashboard at /trade
-- now, and their old addresses are gone.
--
-- In every site's saved menu:
-- - the link to the trading overview becomes the Trade link to /trade,
--   named "Trade", with nothing under it;
-- - every link to an old /protocols/<x> dashboard is removed, wherever it
--   sits, because the Protocols block on the dashboard lists the exchanges.
--
-- A menu with neither is left exactly as it was. Every other link, and the
-- order of what stays, is untouched.
UPDATE "workspaces" AS w
SET
  "settings" = jsonb_set(
    w."settings",
    '{sections}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(section -> 'entries') = 'array' THEN jsonb_set(
              section,
              '{entries}',
              COALESCE(
                (
                  SELECT jsonb_agg(
                    CASE
                      WHEN entry ->> 'href' = '/admin/trading-overview'
                        THEN entry || jsonb_build_object('href', '/trade', 'label', 'Trade', 'children', '[]'::jsonb)
                      WHEN jsonb_typeof(entry -> 'children') = 'array' THEN jsonb_set(
                        entry,
                        '{children}',
                        COALESCE(
                          (
                            SELECT jsonb_agg(child ORDER BY child_at)
                            FROM jsonb_array_elements(entry -> 'children') WITH ORDINALITY AS c (child, child_at)
                            WHERE COALESCE(child ->> 'href', '') NOT LIKE '/protocols/%'
                          ),
                          '[]'::jsonb
                        )
                      )
                      ELSE entry
                    END
                    ORDER BY entry_at
                  )
                  FROM jsonb_array_elements(section -> 'entries') WITH ORDINALITY AS e (entry, entry_at)
                  WHERE COALESCE(entry ->> 'href', '') NOT LIKE '/protocols/%'
                ),
                '[]'::jsonb
              )
            )
            ELSE section
          END
          ORDER BY section_at
        )
        FROM jsonb_array_elements(w."settings" -> 'sections') WITH ORDINALITY AS s (section, section_at)
      ),
      w."settings" -> 'sections'
    )
  ),
  "updated_at" = now()
WHERE jsonb_typeof(w."settings" -> 'sections') = 'array'
  AND (
    (w."settings" -> 'sections')::text LIKE '%"/protocols/%'
    OR (w."settings" -> 'sections')::text LIKE '%"/admin/trading-overview"%'
  );
