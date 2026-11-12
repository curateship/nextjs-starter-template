-- The Projects dashboard in three panels (Tyler, 12 Nov 2026: "We need to
-- consolidate projects, voices, accounts, archive and messages into one
-- cohesive 3 panel design").
--
-- Each person's left page on it: what is written there, its cover and its
-- lock, the same shape as the CRM's and Travel's Trips page, the layout of
-- Overview's widgets, and the Dashboards block's hidden sections and their
-- order. A person with no row sees the page's starting blocks and the
-- starting widgets.
CREATE TABLE IF NOT EXISTS "promo_projects_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- Voices, Accounts, Archive and Messages are sections of the Projects
-- dashboard now, so their links leave every saved left menu: under Projects,
-- where 0119, 0120 and 0134 put them, and anywhere else a person moved them.
-- Projects stays. Their old addresses still open the right section.
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
                        WHERE COALESCE("c"."child"->>'href', '') NOT IN ('/admin/voices', '/admin/accounts', '/admin/archive', '/admin/messages', '/admin/reddit-accounts')
                      ),
                      '[]'::jsonb
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
              WHERE COALESCE("e"."entry"->>'href', '') NOT IN ('/admin/voices', '/admin/accounts', '/admin/archive', '/admin/messages', '/admin/reddit-accounts')
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
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/voices" || @.href == "/admin/accounts" || @.href == "/admin/archive" || @.href == "/admin/messages" || @.href == "/admin/reddit-accounts")')
    OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/voices" || @.href == "/admin/accounts" || @.href == "/admin/archive" || @.href == "/admin/messages" || @.href == "/admin/reddit-accounts")')
  );
