-- Instagram and TikTok on phones, and the direct messages every phone
-- account reads. Phone farm file 06, "Bring Instagram and TikTok into Promo".
--
-- Additions only. Nothing stored is renamed or dropped.

-- The daily health reading of an Instagram or TikTok account: followers,
-- following, posts, and whether the app's own Account status page says its
-- posts may be shown to people who do not follow it (Tyler, 16 Oct 2026:
-- "yes" to reading the shadowban there). Null until read; a shadowban line
-- that could not be read stays null rather than reading as "not shadowbanned".
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "followers" integer;
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "following" integer;
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "post_count" integer;
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "shadowbanned" boolean;
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "shadowban_words" text NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "app_health_read_at" timestamptz;
-- When a phone first read the account signed in. Its profile is not changed
-- in the day after.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "signed_in_at" timestamptz;

-- A photo or video posted from a phone because a person pressed Post.
CREATE TABLE IF NOT EXISTS "promo_app_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "platform" varchar(30) NOT NULL,
  "media_url" varchar(2048) NOT NULL,
  "media_kind" varchar(10) NOT NULL,
  "media_name" varchar(255) NOT NULL DEFAULT '',
  "caption" text NOT NULL DEFAULT '',
  "draft_caption" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "post_url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "job_id" varchar(36),
  "views" integer,
  "likes" integer,
  "comments" integer,
  "numbers_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "posted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_app_posts_account" ON "promo_app_posts" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_app_posts_project" ON "promo_app_posts" ("project_id", "created_at" DESC);

-- A profile change applied in the app because a person pressed Apply.
CREATE TABLE IF NOT EXISTS "promo_profile_edits" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "display_name" varchar(60),
  "bio" text,
  "link" varchar(300),
  "picture_url" varchar(2048),
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "last_error" text NOT NULL DEFAULT '',
  "job_id" varchar(36),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_profile_edits_account" ON "promo_profile_edits" ("account_id", "created_at" DESC);

-- Direct messages and comments on the account's own posts, read off the
-- phone. A conversation is deleted, words and all, once it is answered or
-- skipped; only the hashes in promo_inbox_seen stay.
CREATE TABLE IF NOT EXISTS "promo_inbox" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "platform" varchar(30) NOT NULL,
  "kind" varchar(10) NOT NULL,
  "thread" varchar(200) NOT NULL,
  "author" varchar(120) NOT NULL DEFAULT '',
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "draft" text NOT NULL DEFAULT '',
  "reply_text" text NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "job_id" varchar(36),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_inbox_user" ON "promo_inbox" ("user_id", "status", "updated_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_inbox_thread" ON "promo_inbox" ("account_id", "kind", "thread") WHERE "kind" = 'message';

CREATE TABLE IF NOT EXISTS "promo_inbox_seen" (
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "key" varchar(64) NOT NULL,
  "seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_inbox_seen" ON "promo_inbox_seen" ("account_id", "key");

-- The Messages dashboard in the left menu, under Projects right after
-- Accounts: one list of every phone account's direct messages on Reddit,
-- Instagram and TikTok. Placed after Accounts where Accounts is among
-- Projects' children, and otherwise last among them. A sidebar that already
-- links to /admin/messages, or has no Projects entry, is left alone.
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
                          (SELECT "ord" FROM "kids" WHERE "child"->>'href' = '/admin/accounts' LIMIT 1),
                          (SELECT COALESCE(max("ord"), 0) FROM "kids")
                        ) AS "ord"
                      )
                      SELECT COALESCE(jsonb_agg("item" ORDER BY "pos"), '[]'::jsonb)
                      FROM (
                        SELECT "child" AS "item", "ord"::numeric AS "pos" FROM "kids"
                        UNION ALL
                        SELECT jsonb_build_object(
                          'id', 'item-promo-messages',
                          'href', '/admin/messages',
                          'label', 'Messages',
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
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/messages")')
  AND NOT jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/messages")');
