-- Project first: the social networks a project uses. Tyler, 14 Oct 2026:
-- "social networks are modules so that means we don't have reddit on its own
-- route that sit in the sidebar". Each network is a row in the project's left
-- column, and picking it fills the middle and right columns with its panels.
-- Every project made before this used Reddit, so each one gets Reddit.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "networks" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "promo_projects" SET "networks" = '["reddit"]'::jsonb WHERE "networks" = '[]'::jsonb;

-- Reddit's screens leave the left menu and move inside the project's Reddit
-- module: Today and Comments become tabs in its middle column, Jobs a button
-- that opens a window, and Reddit accounts a window from the accounts
-- dropdown. Tyler, 14 Oct 2026: "all of reddit's subnav (all belongs to reddit)
-- right now can be collapse into reddit's module". Each saved left menu loses
-- those four links wherever they sit, as an entry or under one. Every other
-- entry, Voices included, stays where it is.
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
                  WHEN jsonb_typeof("e"."entry"->'children') = 'array' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    COALESCE(
                      (
                        SELECT jsonb_agg("c"."child" ORDER BY "c"."ord")
                        FROM jsonb_array_elements("e"."entry"->'children') WITH ORDINALITY AS "c"("child", "ord")
                        WHERE NOT (("c"."child"->>'href') IN ('/admin/today', '/admin/comments', '/admin/reddit-accounts', '/admin/jobs'))
                      ),
                      '[]'::jsonb
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
              WHERE NOT (("e"."entry"->>'href') IS NOT NULL
                AND ("e"."entry"->>'href') IN ('/admin/today', '/admin/comments', '/admin/reddit-accounts', '/admin/jobs'))
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
  AND (
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/today" || @.href == "/admin/comments" || @.href == "/admin/reddit-accounts" || @.href == "/admin/jobs")')
    OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/today" || @.href == "/admin/comments" || @.href == "/admin/reddit-accounts" || @.href == "/admin/jobs")')
  );
