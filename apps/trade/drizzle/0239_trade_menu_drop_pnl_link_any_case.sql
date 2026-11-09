-- 0237 removed menu links to /pnl, the P&L page taken out on 9 Nov 2026, but
-- only when the address was written in lower case. The local Nodabot menu's
-- PnL link pointed at /PnL, so it survived, and the page it named is gone.
--
-- This removes every link whose address is /pnl in any mix of capitals,
-- wherever it sits: a top-level entry, with whatever was nested under it, or a
-- child under another entry. Every other link, and the order of what stays, is
-- untouched.
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
                            WHERE lower(COALESCE(child ->> 'href', '')) <> '/pnl'
                          ),
                          '[]'::jsonb
                        )
                      )
                      ELSE entry
                    END
                    ORDER BY entry_at
                  )
                  FROM jsonb_array_elements(section -> 'entries') WITH ORDINALITY AS e (entry, entry_at)
                  WHERE lower(COALESCE(entry ->> 'href', '')) <> '/pnl'
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
  AND lower((w."settings" -> 'sections')::text) LIKE '%"/pnl"%';
