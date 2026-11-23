-- Social, the screens for following X creators, is gone (Tyler, 9 Nov 2026:
-- "I want to remove the social dashboard feature and all of its related codes
-- too", the X creators only). Its addresses /social, /social/manage and
-- /social/<handle> now open nothing, and an admin may have put links to them
-- in the left menu by hand.
--
-- In every site's saved menu, every link to /social or an address under it,
-- in any mix of capitals, is removed, wherever it sits: a top-level entry, with whatever was nested under
-- it, or a child under another entry. A menu without one is left exactly as it
-- was. Every other link, and the order of what stays, is untouched.
-- /t/<handle>, /traders and /following are not under /social and stay.
--
-- The six trade_social_* tables, with the creators and posts members saved,
-- and trade_prefs.social_match_stocks are left in place. The app no longer
-- reads or writes them. Dropping them deletes those rows for good, and
-- dropping the column while the old release is still serving would break that
-- release's reads of trade_prefs until the new one takes over.
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
                            WHERE NOT (lower(COALESCE(child ->> 'href', '')) = '/social' OR lower(COALESCE(child ->> 'href', '')) LIKE '/social/%')
                          ),
                          '[]'::jsonb
                        )
                      )
                      ELSE entry
                    END
                    ORDER BY entry_at
                  )
                  FROM jsonb_array_elements(section -> 'entries') WITH ORDINALITY AS e (entry, entry_at)
                  WHERE NOT (lower(COALESCE(entry ->> 'href', '')) = '/social' OR lower(COALESCE(entry ->> 'href', '')) LIKE '/social/%')
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
  AND lower((w."settings" -> 'sections')::text) LIKE '%"/social%';
