-- The Dating dashboard in the left menu, with the Phone screen under it.
-- Task "tinder/01", part 1.
--
-- Every admin sidebar is a saved list on its workspace, so the link goes into
-- the saved lists: right after the dashboard link, in whichever section has
-- it. A sidebar that already links to /admin/dating, or has no dashboard link,
-- is left alone. Admins only for now: Date is Tyler's own app (17 Oct 2026).
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
          (
            SELECT COALESCE(jsonb_agg("item" ORDER BY "pos"), '[]'::jsonb)
            FROM (
              SELECT "e"."entry" AS "item", "e"."ord"::numeric AS "pos"
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
              UNION ALL
              SELECT jsonb_build_object(
                'id', 'item-date-dating',
                'href', '/admin/dating',
                'icon', 'heartPulse',
                'type', 'item',
                'label', 'Dating',
                'roles', jsonb_build_array('admin'),
                'visible', true,
                'children', jsonb_build_array(
                  jsonb_build_object('id', 'item-date-dating-phone', 'href', '/admin/dating/phone', 'label', 'Phone')
                )
              ), "d"."ord" + 0.5
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "d"("entry", "ord")
              WHERE "d"."entry"->>'href' = '/admin/dashboard'
            ) AS "merged"
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
  AND jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/dashboard")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/dating")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/dating")');
