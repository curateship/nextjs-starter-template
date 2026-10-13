-- The nineteen features Tyler picked on 12 Oct 2026
-- (workspace/tasks/New features/new-features-12-oct.md).
--
-- Additions only, apart from promo_finds.keyword_id, which may now be empty:
-- a post found for one account's everyday subreddits, or a subreddit's
-- self-promotion thread, belongs to no keyword.

-- Part 1. Keywords search again by themselves, every this many hours inside
-- the reader's waking hours. 0 is never. Tyler, 12 Oct 2026: "4h is fine".
ALTER TABLE "promo_behaviour_settings" ADD COLUMN IF NOT EXISTS "search_every_hours" integer NOT NULL DEFAULT 4;

-- Part 17. A paused account, or every account in a paused project, does not
-- post, warm up or take health readings until it is resumed. Null is running.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "paused_at" timestamptz;
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "paused_at" timestamptz;

-- Part 11. A failed comment or post a person has dealt with leaves the Failed
-- tab. The failure is its job, because a comment refused before it reached
-- the browser never gets a comment row, and the job stays.
ALTER TABLE "promo_jobs" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;

-- Part 14. A comment the app deleted from Reddit on a person's press. Kept,
-- so a check never reads it as removed by a moderator.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

-- Part 15. A comment the app edited on Reddit: when, and the words it first
-- went out with. original_text is null until the first edit.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "edited_at" timestamptz;
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "original_text" text;

-- Part 6. A draft made by rewriting the words in the box: 'shorter',
-- 'plainer' or 'no_product'. '' for a draft from Write with AI, so a rewrite
-- never shows among the draft tiles.
ALTER TABLE "promo_drafts" ADD COLUMN IF NOT EXISTS "rewrite" varchar(20) NOT NULL DEFAULT '';

-- Parts 4 and 8. A found post belongs to a keyword, or to one account's
-- everyday subreddits (help_account_id), or is a subreddit's self-promotion
-- thread found for a project (thread_project_id). Exactly one of the three.
ALTER TABLE "promo_finds" ALTER COLUMN "keyword_id" DROP NOT NULL;
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "help_account_id" varchar(36)
  REFERENCES "promo_accounts"("id") ON DELETE CASCADE;
ALTER TABLE "promo_finds" ADD COLUMN IF NOT EXISTS "thread_project_id" varchar(36)
  REFERENCES "promo_projects"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_finds_help_post"
  ON "promo_finds" ("help_account_id", "reddit_id") WHERE "help_account_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_finds_thread_post"
  ON "promo_finds" ("thread_project_id", "reddit_id") WHERE "thread_project_id" IS NOT NULL;

-- Part 10. A post of your own, sent to a subreddit from one account. One row
-- per attempt, like a comment, so a failure leaves a record.
CREATE TABLE IF NOT EXISTS "promo_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "subreddit" varchar(120) NOT NULL,
  "title" varchar(300) NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'posted',
  "post_url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "visit" jsonb,
  "posted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_posts_user" ON "promo_posts" ("user_id", "posted_at" DESC);

-- Part 16. Where each of Promo's bell notices opens. The notice itself is the
-- shell's own row; its id is worked out from what it is about, so one thing
-- has one notice that comes back to the top when it happens again.
CREATE TABLE IF NOT EXISTS "promo_notices" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "href" varchar(600) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Part 19. What a proxy costs a month and when it renews, both typed in by a
-- person and both optional.
ALTER TABLE "promo_proxies" ADD COLUMN IF NOT EXISTS "monthly_cost" numeric(10, 2);
ALTER TABLE "promo_proxies" ADD COLUMN IF NOT EXISTS "renews_on" date;

-- Part 3. The Today page in the left menu, first under Projects, so it is not
-- reachable only by typing /admin/today. Every admin sidebar is a saved list
-- on its workspace, so the link is added to the saved lists that have a
-- Projects entry. A sidebar that already links to /admin/today, or has no
-- Projects entry, is left alone.
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
                    jsonb_build_array(jsonb_build_object(
                      'id', 'item-promo-today',
                      'href', '/admin/today',
                      'label', 'Today',
                      'visible', true
                    ))
                    || (CASE WHEN jsonb_typeof("e"."entry"->'children') = 'array'
                      THEN "e"."entry"->'children' ELSE '[]'::jsonb END)
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
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/today")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/today")');
