-- The Jobs dashboard in the left menu, last under Projects. Tyler, 13 Oct
-- 2026: "Move the jobs dashboard to its own route and put it under projects".
-- Every admin sidebar is a saved list on its workspace, so the link is added
-- to the saved lists that have a Projects entry, after its other children. A
-- sidebar that already links to /admin/jobs, or has no Projects entry, is
-- left alone.
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
                    (CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                      THEN "e"."entry"->'children' ELSE '[]'::jsonb END)
                    || jsonb_build_array(jsonb_build_object(
                      'id', 'item-promo-jobs',
                      'href', '/admin/jobs',
                      'label', 'Jobs',
                      'visible', true
                    ))
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
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/jobs")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/jobs")');
