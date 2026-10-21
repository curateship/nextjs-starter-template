-- One Dating dashboard (Tyler, 20 Oct 2026: "We dont need 4 seperate pages.
-- Condense them all into the 3 col dashboard"): the Phone and Calendar links
-- (0099, 0100) leave the Dating link's children, since those screens are now
-- parts of /admin/dating. Stats and My profile are taken out too, in case a
-- database got them while they were screens of their own. Any other child a person added stays, and a
-- sidebar with none of these links is left alone, so running this twice
-- changes nothing.
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
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'id' = 'item-date-dating' AND jsonb_typeof("e"."entry"->'children') = 'array' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    (
                      SELECT COALESCE(jsonb_agg("c"."child" ORDER BY "c"."ord"), '[]'::jsonb)
                      FROM jsonb_array_elements("e"."entry"->'children') WITH ORDINALITY AS "c"("child", "ord")
                      WHERE "c"."child"->>'href' NOT IN ('/admin/dating/phone', '/admin/dating/calendar', '/admin/dating/stats', '/admin/dating/my-profile')
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
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
  AND jsonb_path_exists(
    "w"."settings",
    '$.sections[*].entries[*].children[*] ? (@.href == "/admin/dating/phone" || @.href == "/admin/dating/calendar" || @.href == "/admin/dating/stats" || @.href == "/admin/dating/my-profile")'
  );
