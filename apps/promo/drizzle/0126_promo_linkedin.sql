-- LinkedIn as a network (workspace/tasks/LinkedIn/01-linkedin-features.md):
-- its keywords, the posts they and the accounts' feeds find, the comments
-- and posts of your own that went out, the groups a project posts in, the
-- company pages an account runs, the connection requests sent and received,
-- the people who viewed a profile, the spare accounts that only read, each
-- account's weekly numbers, and LinkedIn's own numbers in Settings ->
-- Behaviour.
--
-- Additions only. Nothing stored is renamed or dropped.

-- An account that pays for LinkedIn Premium sees every profile viewer and
-- every number (part 8).
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "linkedin_premium" boolean NOT NULL DEFAULT false;
-- The weekly look at whether the account's comments still show to someone
-- else (part 46): '' until read, then 'seen' or 'hidden'.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "linkedin_seen" varchar(10) NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "linkedin_seen_at" timestamptz;
-- When LinkedIn last asked the account for the code it emails at sign-in
-- (part 4), null when it is not asking.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "linkedin_code_asked_at" timestamptz;

-- LinkedIn's own numbers in Settings -> Behaviour. No row means where they
-- begin: 20 comments and posts a day for a young account, 300 posts viewed a
-- day by each search account, and 20 connection requests a week.
CREATE TABLE IF NOT EXISTS "promo_linkedin_settings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "comments_per_day" integer NOT NULL DEFAULT 20,
  "views_per_day" integer NOT NULL DEFAULT 300,
  "connects_per_week" integer NOT NULL DEFAULT 20,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- A project's LinkedIn-only settings: the job titles of the people it sells
-- to, which lift a post in the list (part 14).
CREATE TABLE IF NOT EXISTS "promo_linkedin_projects" (
  "project_id" varchar(36) PRIMARY KEY REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "buyer_titles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- A LinkedIn keyword: search words, a hashtag, or a person or company page
-- watched for its new posts. `mark` is 'you' or 'rival' on search words
-- naming a product.
CREATE TABLE IF NOT EXISTS "promo_linkedin_keywords" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE RESTRICT,
  "kind" varchar(20) NOT NULL,
  "value" varchar(200) NOT NULL,
  "mark" varchar(10) NOT NULL DEFAULT '',
  "enabled" boolean NOT NULL DEFAULT true,
  "notify" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamptz,
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_keywords_project" ON "promo_linkedin_keywords" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_keywords_value" ON "promo_linkedin_keywords" ("project_id", "kind", lower("value"));

-- A LinkedIn post a keyword found, or that turned up in an account's own
-- feed (part 13), and what was decided about it.
CREATE TABLE IF NOT EXISTS "promo_linkedin_finds" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) REFERENCES "promo_linkedin_keywords"("id") ON DELETE CASCADE,
  "feed_account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "post_id" varchar(25) NOT NULL,
  "url" varchar(400) NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "author_name" varchar(200) NOT NULL DEFAULT '',
  "author_headline" varchar(300) NOT NULL DEFAULT '',
  "author_slug" varchar(100) NOT NULL DEFAULT '',
  "author_kind" varchar(10) NOT NULL DEFAULT 'person',
  "author_followers" integer,
  "posted_at" timestamptz,
  "reactions" integer NOT NULL DEFAULT 0,
  "comments" integer NOT NULL DEFAULT 0,
  "reposts" integer NOT NULL DEFAULT 0,
  "can_comment" boolean NOT NULL DEFAULT true,
  "link" varchar(600) NOT NULL DEFAULT '',
  "position" integer NOT NULL DEFAULT 0,
  "rank" numeric(10, 4) NOT NULL DEFAULT 0,
  "matched_title" varchar(60) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "top_comments" jsonb,
  "read_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_finds_keyword_post" ON "promo_linkedin_finds" ("keyword_id", "post_id") WHERE "keyword_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_finds_feed_post" ON "promo_linkedin_finds" ("feed_account_id", "post_id") WHERE "feed_account_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_finds_project_status" ON "promo_linkedin_finds" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_finds_status_seen" ON "promo_linkedin_finds" ("status", "first_seen_at");
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_finds_post" ON "promo_linkedin_finds" ("user_id", "post_id");

-- People and company pages whose posts are never shown again (part 17).
CREATE TABLE IF NOT EXISTS "promo_linkedin_hidden" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "kind" varchar(10) NOT NULL DEFAULT 'person',
  "name" varchar(200) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_hidden" ON "promo_linkedin_hidden" ("user_id", "kind", lower("slug"));

-- What the AI wrote for a post, kept after sending.
CREATE TABLE IF NOT EXISTS "promo_linkedin_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "find_id" varchar(36) REFERENCES "promo_linkedin_finds"("id") ON DELETE CASCADE,
  "reply_to_id" varchar(40) NOT NULL DEFAULT '',
  "text" text NOT NULL,
  "help_only" boolean NOT NULL DEFAULT false,
  "rewrite" varchar(20) NOT NULL DEFAULT '',
  "provider" varchar(30) NOT NULL DEFAULT '',
  "model" varchar(120) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_drafts_find" ON "promo_linkedin_drafts" ("find_id", "created_at" DESC);

-- A comment, a reply under a top comment, or an answer that went out, or
-- tried to. One row per press.
CREATE TABLE IF NOT EXISTS "promo_linkedin_comments" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "kind" varchar(10) NOT NULL DEFAULT 'comment',
  "find_id" varchar(36) REFERENCES "promo_linkedin_finds"("id") ON DELETE SET NULL,
  "draft_id" varchar(36) REFERENCES "promo_linkedin_drafts"("id") ON DELETE SET NULL,
  "parent_id" varchar(36) REFERENCES "promo_linkedin_comments"("id") ON DELETE CASCADE,
  "target_id" varchar(25) NOT NULL,
  "parent_comment_id" varchar(40) NOT NULL DEFAULT '',
  "target_url" varchar(400) NOT NULL DEFAULT '',
  "target_name" varchar(200) NOT NULL DEFAULT '',
  "target_slug" varchar(100) NOT NULL DEFAULT '',
  "target_text" text NOT NULL DEFAULT '',
  "reply_to" jsonb,
  "text" text NOT NULL,
  "help_only" boolean NOT NULL DEFAULT false,
  "not_example" boolean NOT NULL DEFAULT false,
  "as_page_id" varchar(30) NOT NULL DEFAULT '',
  "similar_to" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "comment_id" varchar(40) NOT NULL DEFAULT '',
  "comment_url" varchar(400) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "reactions" integer,
  "reply_count" integer,
  "still_visible" boolean,
  "checked_at" timestamptz,
  "incoming" jsonb,
  "deleted_at" timestamptz,
  "edited_at" timestamptz,
  "original_text" text,
  "sent_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "posted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_comments_account" ON "promo_linkedin_comments" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_comments_project" ON "promo_linkedin_comments" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_comments_target" ON "promo_linkedin_comments" ("user_id", "target_id");

-- A post, repost or newsletter issue of the account's own (parts 28 to 38).
CREATE TABLE IF NOT EXISTS "promo_linkedin_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "kind" varchar(20) NOT NULL DEFAULT 'post',
  "text" text NOT NULL DEFAULT '',
  "title" varchar(200) NOT NULL DEFAULT '',
  "picture_url" varchar(2048) NOT NULL DEFAULT '',
  "video_url" varchar(2048) NOT NULL DEFAULT '',
  "poll" jsonb,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "repost_of" varchar(25) NOT NULL DEFAULT '',
  "group_id" varchar(20) NOT NULL DEFAULT '',
  "as_page_id" varchar(30) NOT NULL DEFAULT '',
  "first_comment" varchar(600) NOT NULL DEFAULT '',
  "first_comment_id" varchar(40) NOT NULL DEFAULT '',
  "source" varchar(80) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "scheduled_for" timestamptz,
  "job_id" varchar(36),
  "post_id" varchar(25) NOT NULL DEFAULT '',
  "post_url" varchar(400) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "reactions" integer,
  "comment_count" integer,
  "reposts" integer,
  "impressions" integer,
  "still_visible" boolean,
  "checked_at" timestamptz,
  "incoming" jsonb,
  "deleted_at" timestamptz,
  "edited_at" timestamptz,
  "sent_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "posted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_posts_project" ON "promo_linkedin_posts" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_posts_account" ON "promo_linkedin_posts" ("account_id", "created_at" DESC);

-- A LinkedIn group a project posts in, with its rules (part 37).
CREATE TABLE IF NOT EXISTS "promo_linkedin_groups" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "group_id" varchar(20) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "rules" text NOT NULL DEFAULT '',
  "members" integer,
  "rules_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_groups" ON "promo_linkedin_groups" ("project_id", "group_id");

-- A company page an account runs (part 38).
CREATE TABLE IF NOT EXISTS "promo_linkedin_pages" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "page_id" varchar(30) NOT NULL,
  "slug" varchar(100) NOT NULL DEFAULT '',
  "name" varchar(200) NOT NULL DEFAULT '',
  "seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_pages" ON "promo_linkedin_pages" ("account_id", "page_id");

-- A connection request an account sent, or tried to (part 39).
CREATE TABLE IF NOT EXISTS "promo_linkedin_connects" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "headline" varchar(300) NOT NULL DEFAULT '',
  "note" varchar(300) NOT NULL DEFAULT '',
  "source" varchar(10) NOT NULL DEFAULT 'post',
  "comment_row_id" varchar(36) REFERENCES "promo_linkedin_comments"("id") ON DELETE SET NULL,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_connects" ON "promo_linkedin_connects" ("account_id", lower("slug"));
CREATE INDEX IF NOT EXISTS "ix_promo_linkedin_connects_account" ON "promo_linkedin_connects" ("account_id", "created_at" DESC);

-- A connection request somebody sent one of the accounts (part 40). Its slug
-- is kept in lower case, so one person is one row.
CREATE TABLE IF NOT EXISTS "promo_linkedin_invites" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "headline" varchar(300) NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "last_error" text NOT NULL DEFAULT '',
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "accepted_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_invites" ON "promo_linkedin_invites" ("account_id", "slug");

-- Somebody who looked at one of the accounts' profiles (part 41). Its slug is
-- kept in lower case, so one person is one row.
CREATE TABLE IF NOT EXISTS "promo_linkedin_viewers" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "headline" varchar(300) NOT NULL DEFAULT '',
  "viewed_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_viewers" ON "promo_linkedin_viewers" ("account_id", "slug");

-- A browser profile signed in to a spare LinkedIn account that only reads
-- (part 3). Its views are counted per UTC day.
CREATE TABLE IF NOT EXISTS "promo_linkedin_searchers" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" varchar(36) NOT NULL REFERENCES "promo_profiles"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL DEFAULT '',
  "views_on" date,
  "views" integer NOT NULL DEFAULT 0,
  "stopped_on" date,
  "stop_reason" text NOT NULL DEFAULT '',
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_linkedin_searchers_profile" ON "promo_linkedin_searchers" ("profile_id");

-- One reading a week of a LinkedIn account's numbers (part 47). A number only
-- Premium sees is null on a free account, never 0.
CREATE TABLE IF NOT EXISTS "promo_linkedin_readings" (
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "read_on" date NOT NULL,
  "followers" integer,
  "connections" integer,
  "profile_views" integer,
  "impressions" integer,
  PRIMARY KEY ("account_id", "read_on")
);
