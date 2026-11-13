-- The Anti Detect dashboard in three panels (Tyler, 12 Nov 2026: "now
-- comebine the 4 antidect dashboard into one 3 panel dashboard like we did
-- here"): Browser profiles, Proxies, Racks and Bans are its sections.
--
-- Each person's left page on it, the same shape as promo_projects_pages.
CREATE TABLE IF NOT EXISTS "promo_anti_detect_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- The left menu: in every saved menu, the first of the four links in a
-- section becomes one Anti Detect link, and the other three go (children
-- included). Tyler's answer: "Anti Detect", one link in place of the four.
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
                  WHEN "e"."first" THEN jsonb_build_object(
                    'id', 'item-promo-anti-detect',
                    'type', 'item',
                    'label', 'Anti Detect',
                    'href', '/admin/anti-detect',
                    'icon', 'shield',
                    'visible', true
                  )
                  WHEN jsonb_typeof("e"."entry"->'children') = 'array' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    COALESCE(
                      (
                        SELECT jsonb_agg("c"."child" ORDER BY "c"."ord")
                        FROM jsonb_array_elements("e"."entry"->'children') WITH ORDINALITY AS "c"("child", "ord")
                        WHERE COALESCE("c"."child"->>'href', '') NOT IN ('/admin/profiles', '/admin/proxies', '/admin/racks', '/admin/bans')
                      ),
                      '[]'::jsonb
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM (
                SELECT
                  "x"."entry",
                  "x"."ord",
                  COALESCE("x"."entry"->>'href', '') IN ('/admin/profiles', '/admin/proxies', '/admin/racks', '/admin/bans') AS "old",
                  "x"."ord" = (
                    SELECT min("y"."ord")
                    FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "y"("entry", "ord")
                    WHERE COALESCE("y"."entry"->>'href', '') IN ('/admin/profiles', '/admin/proxies', '/admin/racks', '/admin/bans')
                  ) AS "first"
                FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "x"("entry", "ord")
              ) AS "e"
              WHERE "e"."first" OR NOT "e"."old"
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
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/profiles" || @.href == "/admin/proxies" || @.href == "/admin/racks" || @.href == "/admin/bans")')
    OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/profiles" || @.href == "/admin/proxies" || @.href == "/admin/racks" || @.href == "/admin/bans")')
  );

-- A section left holding only the Anti Detect link loses its heading: the
-- link moves to the end of the section above it (Tyler's answer: "The menu's
-- Anti Detect heading goes, since it would hold one link"). The first
-- section keeps its heading, having none above it.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN "t"."next_lone" THEN jsonb_set("t"."section", '{entries}', COALESCE("t"."section"->'entries', '[]'::jsonb) || ("t"."next_section"->'entries'))
        ELSE "t"."section"
      END
      ORDER BY "t"."ord"
    )
    FROM (
      SELECT
        "s"."section",
        "s"."ord",
        "s"."lone",
        lead("s"."section") OVER (ORDER BY "s"."ord") AS "next_section",
        COALESCE(lead("s"."lone") OVER (ORDER BY "s"."ord"), false) AS "next_lone"
      FROM (
        SELECT
          "a"."section",
          "a"."ord",
          jsonb_typeof("a"."section"->'entries') = 'array'
            AND jsonb_array_length("a"."section"->'entries') = 1
            AND "a"."section"->'entries'->0->>'href' = '/admin/anti-detect' AS "lone"
        FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "a"("section", "ord")
      ) AS "s"
    ) AS "t"
    WHERE NOT ("t"."lone" AND "t"."ord" > 1)
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_path_exists("w"."settings", '$.sections[*] ? (@.entries.size() == 1 && @.entries[0].href == "/admin/anti-detect")');
