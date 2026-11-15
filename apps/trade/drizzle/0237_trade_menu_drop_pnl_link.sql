-- The P&L page at /pnl is gone (Tyler, 8 Nov 2026: "lets remove the Pnl
-- dashboard and the features/codes associate with it"). The page never put
-- itself in the left menu, but an admin could add a link to it by hand, and
-- that link would now open a page that does not exist.
--
-- In every site's saved menu, every link to /pnl is removed, wherever it
-- sits: a top-level entry or a child under one. A menu without one is left
-- exactly as it was. Every other link, and the order of what stays, is
-- untouched.
--
-- The trade_prefs.pnl_scores column, where the page kept its AI scores, is
-- left in place. The app no longer reads or writes it, and dropping it while
-- the old release is still serving would break that release's reads of
-- trade_prefs until the new one takes over.
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
                      WHEN jsonb_typeof(entry -> 'children') = 'array' THEN jsonb_set(
                        entry,
                        '{children}',
                        COALESCE(
                          (
                            SELECT jsonb_agg(child ORDER BY child_at)
                            FROM jsonb_array_elements(entry -> 'children') WITH ORDINALITY AS c (child, child_at)
                            WHERE COALESCE(child ->> 'href', '') <> '/pnl'
                          ),
                          '[]'::jsonb
                        )
                      )
                      ELSE entry
                    END
                    ORDER BY entry_at
                  )
                  FROM jsonb_array_elements(section -> 'entries') WITH ORDINALITY AS e (entry, entry_at)
                  WHERE COALESCE(entry ->> 'href', '') <> '/pnl'
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
  AND (w."settings" -> 'sections')::text LIKE '%"/pnl"%';
