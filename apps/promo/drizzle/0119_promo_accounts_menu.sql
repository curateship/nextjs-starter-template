-- The Accounts dashboard in the left menu, under Projects right after Voices.
-- Tyler, 15 Oct 2026: "I think accounts should be on its own dashboard with
-- platform filtering", placed under Projects next to Voices by his choice.
-- Every admin sidebar is a saved list on its workspace, so the link goes into
-- the saved lists that have a Projects entry: after Voices where Voices is
-- among its children, and otherwise last among them. A sidebar that already
-- links to /admin/accounts, or has no Projects entry, is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        ELSE jsonb_set(
          "s"."section",
          '{entries}',
          COALESCE(
            (
              SELECT jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'href' = '/admin/projects' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    (
                      WITH "kids" AS (
                        SELECT "c"."child", "c"."ord"
                        FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                            THEN "e"."entry"->'children' ELSE '[]'::jsonb END
                        ) WITH ORDINALITY AS "c"("child", "ord")
                      ),
                      "at" AS (
                        SELECT COALESCE(
                          (SELECT "ord" FROM "kids" WHERE "child"->>'href' = '/admin/voices' LIMIT 1),
                          (SELECT COALESCE(max("ord"), 0) FROM "kids")
                        ) AS "ord"
                      )
                      SELECT COALESCE(jsonb_agg("item" ORDER BY "pos"), '[]'::jsonb)
                      FROM (
                        SELECT "child" AS "item", "ord"::numeric AS "pos" FROM "kids"
                        UNION ALL
                        SELECT jsonb_build_object(
                          'id', 'item-promo-accounts',
                          'href', '/admin/accounts',
                          'label', 'Accounts',
                          'visible', true
                        ), "ord" + 0.5 FROM "at"
                      ) AS "merged"
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
            ),
            '[]'::jsonb
          )
        )
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/projects")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/accounts")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/accounts")');
