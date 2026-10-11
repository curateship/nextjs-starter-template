-- What became of a sent comment: its upvotes, how many replies sit under it,
-- whether it is still there, and when it was last read. All null until the
-- first reading, because a comment nobody has checked must never read as one
-- with no replies. checked_as is whose view decided whether it is still
-- there: 'stranger', which shows a moderator's removal, or 'you' when Reddit
-- refused to answer a stranger.
--
-- Additions only.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "upvotes" integer;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "reply_count" integer;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "still_visible" boolean;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "checked_as" varchar(10);
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "checked_at" timestamptz;

-- The comments screen in the left menu, under Reddit, so it is not reachable
-- only by typing /admin/comments. Every admin sidebar is a saved list on its
-- workspace, so the link is added to the saved lists: under the Reddit link
-- where there is one, otherwise as a Reddit link with Comments under it at the
-- end of the Administration section. A sidebar that already links to
-- /admin/comments, or has never been saved, is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        WHEN "has_reddit" THEN jsonb_set(
          "s"."section",
          '{entries}',
          COALESCE(
            (
              SELECT jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'href' = '/admin/reddit' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    (CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                      THEN "e"."entry"->'children' ELSE '[]'::jsonb END)
                    || jsonb_build_array(jsonb_build_object(
                      'id', 'item-promo-comments',
                      'href', '/admin/comments',
                      'label', 'Comments',
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
        WHEN "s"."section"->>'id' = 'section-administration' THEN jsonb_set(
          "s"."section",
          '{entries}',
          ("s"."section"->'entries') || jsonb_build_array(jsonb_build_object(
            'id', 'item-promo-reddit',
            'href', '/admin/reddit',
            'icon', 'messageSquarePlus',
            'type', 'item',
            'label', 'Reddit',
            'roles', jsonb_build_array('admin'),
            'visible', true,
            'children', jsonb_build_array(jsonb_build_object(
              'id', 'item-promo-comments',
              'href', '/admin/comments',
              'label', 'Comments',
              'visible', true
            ))
          ))
        )
        ELSE "s"."section"
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord"),
    LATERAL (
      SELECT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/reddit")') AS "has_reddit"
    ) AS "r"
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/comments")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/comments")')
  AND (
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/reddit")')
    OR jsonb_path_exists("w"."settings", '$.sections[*] ? (@.id == "section-administration" && @.entries.type() == "array")')
  );
