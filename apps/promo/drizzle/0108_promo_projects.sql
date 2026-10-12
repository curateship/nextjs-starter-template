-- Projects, and the Reddit accounts dashboard's two account columns.
--
-- A project is one thing being promoted: its description, which the AI is
-- told in place of the voice's old "what you make" box, its Reddit accounts
-- and its keywords. Tyler, 12 Oct 2026: keywords belong to the project, and an
-- account belongs to one project only.
--
-- Additions only, apart from the two keyword indexes, which move from one per
-- person to one per project so two projects may search the same words.
-- promo_voices.product stays in the table; nothing reads it any more.

-- A status a person chose on the Reddit accounts dashboard, outranking the one
-- the app works out. Null lets the app decide. One of 'warming_up', 'ready',
-- 'working' or 'banned'.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "status_override" varchar(20);

-- When the account was retired. A retired account leaves the list and every
-- picker, never posts and never warms up; its comments stay. Null is in use.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "retired_at" timestamptz;

CREATE TABLE IF NOT EXISTS "promo_projects" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_projects_user" ON "promo_projects" ("user_id");

-- An account is in at most one project. Deleting a project is refused while
-- it holds accounts in use, so only a retired account can be left behind, and
-- it is let go rather than blocking the delete.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "project_id" varchar(36)
  REFERENCES "promo_projects"("id") ON DELETE SET NULL;

-- A keyword is in exactly one project. Deleting a project is refused while it
-- holds keywords, and the database refuses it too.
ALTER TABLE "promo_keywords" ADD COLUMN IF NOT EXISTS "project_id" varchar(36)
  REFERENCES "promo_projects"("id") ON DELETE RESTRICT;

-- The first project, for everybody who already has keywords or accounts, so
-- nothing goes missing on the day this ships. Its description starts as the
-- product text of the voice the first account uses, so the AI is told what it
-- was told before.
INSERT INTO "promo_projects" ("id", "user_id", "name", "description")
SELECT
  gen_random_uuid()::text,
  "people"."user_id",
  'My project',
  COALESCE(
    (
      SELECT "v"."product"
      FROM "promo_accounts" AS "a"
      JOIN "promo_voices" AS "v" ON "v"."id" = "a"."voice_id"
      WHERE "a"."user_id" = "people"."user_id" AND "a"."platform" = 'reddit'
      ORDER BY "a"."created_at" ASC, "a"."id" ASC
      LIMIT 1
    ),
    ''
  )
FROM (
  SELECT "user_id" FROM "promo_keywords"
  UNION
  SELECT "user_id" FROM "promo_accounts" WHERE "platform" = 'reddit'
) AS "people"
WHERE NOT EXISTS (
  SELECT 1 FROM "promo_projects" AS "p" WHERE "p"."user_id" = "people"."user_id"
);

UPDATE "promo_keywords" AS "k"
SET "project_id" = (
  SELECT "p"."id" FROM "promo_projects" AS "p"
  WHERE "p"."user_id" = "k"."user_id"
  ORDER BY "p"."created_at" ASC, "p"."id" ASC
  LIMIT 1
)
WHERE "k"."project_id" IS NULL;

UPDATE "promo_accounts" AS "a"
SET "project_id" = (
  SELECT "p"."id" FROM "promo_projects" AS "p"
  WHERE "p"."user_id" = "a"."user_id"
  ORDER BY "p"."created_at" ASC, "p"."id" ASC
  LIMIT 1
)
WHERE "a"."project_id" IS NULL AND "a"."platform" = 'reddit';

ALTER TABLE "promo_keywords" ALTER COLUMN "project_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_promo_keywords_project" ON "promo_keywords" ("project_id");
CREATE INDEX IF NOT EXISTS "ix_promo_accounts_project" ON "promo_accounts" ("project_id");

-- One saved search per set of words, and one watch per subreddit, inside a
-- project rather than across everything the person has.
DROP INDEX IF EXISTS "ux_promo_keywords_user_term";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_keywords_project_term"
  ON "promo_keywords" ("project_id", lower("term"))
  WHERE "term" <> '';
DROP INDEX IF EXISTS "ux_promo_keywords_user_watch";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_keywords_project_watch"
  ON "promo_keywords" ("project_id", lower("subreddits"->>0))
  WHERE "term" = '';

-- The left menu. Projects takes the Reddit entry's place, keeping whatever
-- sat under it (Comments, and Voices where a person put it there), and gains
-- Reddit accounts. Every admin left menu is a saved list on its workspace, so
-- the saved lists are changed. A left menu with no Reddit entry gets Projects,
-- with Reddit accounts and Comments under it, at the end of its
-- Administration section; Comments is left out there when it is already
-- linked elsewhere. A left menu that already links to /admin/projects, or has
-- never been saved, is left alone.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        WHEN "r"."has_reddit" THEN jsonb_set(
          "s"."section",
          '{entries}',
          COALESCE(
            (
              SELECT jsonb_agg(
                CASE
                  WHEN "e"."entry"->>'href' = '/admin/reddit' THEN
                    ("e"."entry" - 'children')
                    || jsonb_build_object(
                      'id', 'item-promo-projects',
                      'href', '/admin/projects',
                      'icon', 'folderOpen',
                      'label', 'Projects',
                      'children',
                      (CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                        THEN "e"."entry"->'children' ELSE '[]'::jsonb END)
                      || jsonb_build_array(jsonb_build_object(
                        'id', 'item-promo-reddit-accounts',
                        'href', '/admin/reddit-accounts',
                        'label', 'Reddit accounts',
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
            'id', 'item-promo-projects',
            'href', '/admin/projects',
            'icon', 'folderOpen',
            'type', 'item',
            'label', 'Projects',
            'roles', jsonb_build_array('admin'),
            'visible', true,
            'children',
            jsonb_build_array(jsonb_build_object(
              'id', 'item-promo-reddit-accounts',
              'href', '/admin/reddit-accounts',
              'label', 'Reddit accounts',
              'visible', true
            ))
            || (CASE WHEN "r"."has_comments" THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
              'id', 'item-promo-comments',
              'href', '/admin/comments',
              'label', 'Comments',
              'visible', true
            )) END)
          ))
        )
        ELSE "s"."section"
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord"),
    LATERAL (
      SELECT
        jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/reddit")') AS "has_reddit",
        (
          jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/comments")')
          OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/comments")')
        ) AS "has_comments"
    ) AS "r"
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/projects")')
  AND (
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/reddit")')
    OR jsonb_path_exists("w"."settings", '$.sections[*] ? (@.id == "section-administration" && @.entries.type() == "array")')
  );
