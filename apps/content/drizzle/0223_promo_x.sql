-- X as a network (workspace/tasks/X/01-x-features.md): its keywords, the
-- posts they find, the replies, quotes and posts of your own that went out,
-- the communities a project posts in, the accounts on an account's public
-- list, the people an account followed, the throwaway accounts that only
-- search, each account's daily reading, the trends last read, and X's own
-- numbers in Settings -> Behaviour.
--
-- Additions only. Nothing stored is renamed or dropped.

-- When X says the account joined, read off its own page. Its 7-day warm-up
-- counts from here, or from when Promo first saw it signed in.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_joined_at" timestamptz;
-- A paid X account may send longer posts and edit within the hour (part 27).
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_paid" boolean NOT NULL DEFAULT false;
-- The daily search-ban look (part 42): '' until read, then 'seen',
-- 'hidden' or 'folded'.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_reach" varchar(10) NOT NULL DEFAULT '';
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_reach_at" timestamptz;
-- Follow the people this account replies to (part 44). Off to begin with.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_follow_back" boolean NOT NULL DEFAULT false;
-- Every this-many-th reply from the account starts as Help only (part 24).
-- 0 is never.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "x_help_every" integer NOT NULL DEFAULT 0;

-- X's own numbers in Settings -> Behaviour. No row means where they begin:
-- 100 replies a day, 10 an hour, 500 posts viewed a day by each search
-- account, and 5 follows a day.
CREATE TABLE IF NOT EXISTS "promo_x_settings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "replies_per_day" integer NOT NULL DEFAULT 100,
  "replies_per_hour" integer NOT NULL DEFAULT 10,
  "views_per_day" integer NOT NULL DEFAULT 500,
  "follows_per_day" integer NOT NULL DEFAULT 5,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- An X keyword: search words, a hashtag, or an account watched for its new
-- posts. `mark` is 'you' or 'rival' on search words naming a product.
CREATE TABLE IF NOT EXISTS "promo_x_keywords" (
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
CREATE INDEX IF NOT EXISTS "ix_promo_x_keywords_project" ON "promo_x_keywords" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_keywords_value"
  ON "promo_x_keywords" ("project_id", "kind", lower("value"));

-- An X post a keyword found, and what was decided about it.
CREATE TABLE IF NOT EXISTS "promo_x_finds" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "promo_x_keywords"("id") ON DELETE CASCADE,
  "post_id" varchar(25) NOT NULL,
  "url" varchar(300) NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "author_id" varchar(25) NOT NULL DEFAULT '',
  "author_handle" varchar(20) NOT NULL DEFAULT '',
  "author_name" varchar(200) NOT NULL DEFAULT '',
  "author_followers" integer,
  "posted_at" timestamptz,
  "views" integer,
  "likes" integer NOT NULL DEFAULT 0,
  "replies" integer NOT NULL DEFAULT 0,
  "reposts" integer NOT NULL DEFAULT 0,
  "replies_open" boolean NOT NULL DEFAULT true,
  "link" varchar(600) NOT NULL DEFAULT '',
  "position" integer NOT NULL DEFAULT 0,
  "rank" numeric(10, 4) NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "top_replies" jsonb,
  "read_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_finds_keyword_post" ON "promo_x_finds" ("keyword_id", "post_id");
CREATE INDEX IF NOT EXISTS "ix_promo_x_finds_user_status" ON "promo_x_finds" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_promo_x_finds_status_seen" ON "promo_x_finds" ("status", "first_seen_at");
CREATE INDEX IF NOT EXISTS "ix_promo_x_finds_post" ON "promo_x_finds" ("user_id", "post_id");

-- Accounts whose posts are never shown again (part 16).
CREATE TABLE IF NOT EXISTS "promo_x_hidden" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "handle" varchar(20) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_hidden" ON "promo_x_hidden" ("user_id", lower("handle"));

-- What the AI wrote for a post.
CREATE TABLE IF NOT EXISTS "promo_x_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "find_id" varchar(36) REFERENCES "promo_x_finds"("id") ON DELETE CASCADE,
  "kind" varchar(10) NOT NULL DEFAULT 'reply',
  "reply_to_id" varchar(25) NOT NULL DEFAULT '',
  "text" text NOT NULL,
  "help_only" boolean NOT NULL DEFAULT false,
  "rewrite" varchar(20) NOT NULL DEFAULT '',
  "provider" varchar(30) NOT NULL DEFAULT '',
  "model" varchar(120) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_x_drafts_find" ON "promo_x_drafts" ("find_id", "created_at" DESC);

-- A reply, quote or answer that went out, or tried to. One row per press.
CREATE TABLE IF NOT EXISTS "promo_x_replies" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "kind" varchar(10) NOT NULL DEFAULT 'reply',
  "find_id" varchar(36) REFERENCES "promo_x_finds"("id") ON DELETE SET NULL,
  "draft_id" varchar(36) REFERENCES "promo_x_drafts"("id") ON DELETE SET NULL,
  "parent_id" varchar(36) REFERENCES "promo_x_replies"("id") ON DELETE CASCADE,
  "target_id" varchar(25) NOT NULL,
  "target_url" varchar(300) NOT NULL DEFAULT '',
  "target_handle" varchar(20) NOT NULL DEFAULT '',
  "target_text" text NOT NULL DEFAULT '',
  "reply_to" jsonb,
  "text" text NOT NULL,
  "help_only" boolean NOT NULL DEFAULT false,
  "similar_to" text NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "post_id" varchar(25) NOT NULL DEFAULT '',
  "post_url" varchar(300) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "views" integer,
  "likes" integer,
  "reply_count" integer,
  "reposts" integer,
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
CREATE INDEX IF NOT EXISTS "ix_promo_x_replies_account" ON "promo_x_replies" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_x_replies_project" ON "promo_x_replies" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_x_replies_target" ON "promo_x_replies" ("user_id", "target_id");

-- A post or thread of the account's own.
CREATE TABLE IF NOT EXISTS "promo_x_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "pieces" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "poll" jsonb,
  "community_id" varchar(25) NOT NULL DEFAULT '',
  "source" varchar(80) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "scheduled_for" timestamptz,
  "job_id" varchar(36),
  "last_error" text NOT NULL DEFAULT '',
  "views" integer,
  "likes" integer,
  "reply_count" integer,
  "reposts" integer,
  "still_visible" boolean,
  "checked_at" timestamptz,
  "incoming" jsonb,
  "deleted_at" timestamptz,
  "sent_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "posted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_x_posts_project" ON "promo_x_posts" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_x_posts_account" ON "promo_x_posts" ("account_id", "created_at" DESC);

-- An X community that suits a project, with its rules (part 35).
CREATE TABLE IF NOT EXISTS "promo_x_communities" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "community_id" varchar(25) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "rules" text NOT NULL DEFAULT '',
  "members" integer,
  "rules_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_communities" ON "promo_x_communities" ("project_id", "community_id");

-- An account on an account's public X list (part 36).
CREATE TABLE IF NOT EXISTS "promo_x_list_items" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "handle" varchar(20) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "added_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_list_items" ON "promo_x_list_items" ("account_id", lower("handle"));

-- A person the account followed after replying to them (part 44).
CREATE TABLE IF NOT EXISTS "promo_x_follows" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "handle" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_follows" ON "promo_x_follows" ("account_id", lower("handle"));
CREATE INDEX IF NOT EXISTS "ix_promo_x_follows_account" ON "promo_x_follows" ("account_id", "created_at" DESC);

-- A browser profile signed in to a throwaway X account that only searches
-- (parts 3 to 5), with its views counted per day.
CREATE TABLE IF NOT EXISTS "promo_x_searchers" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" varchar(36) NOT NULL REFERENCES "promo_profiles"("id") ON DELETE CASCADE,
  "handle" varchar(20) NOT NULL DEFAULT '',
  "views_on" date,
  "views" integer NOT NULL DEFAULT 0,
  "stopped_on" date,
  "stop_reason" text NOT NULL DEFAULT '',
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_searchers_profile" ON "promo_x_searchers" ("profile_id");

-- One reading a day of an X account's followers and views (part 43).
CREATE TABLE IF NOT EXISTS "promo_x_readings" (
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "read_on" date NOT NULL,
  "followers" integer,
  "views" integer,
  PRIMARY KEY ("account_id", "read_on")
);

-- What X said was trending, the last time it was read (part 15).
CREATE TABLE IF NOT EXISTS "promo_x_trends" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "place" varchar(200) NOT NULL DEFAULT '',
  "trends" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "read_at" timestamptz NOT NULL DEFAULT now()
);

-- A post that names an X account without replying under one of ours (part 39).
CREATE TABLE IF NOT EXISTS "promo_x_mentions" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "post_id" varchar(25) NOT NULL,
  "handle" varchar(20) NOT NULL DEFAULT '',
  "name" varchar(200) NOT NULL DEFAULT '',
  "text" text NOT NULL DEFAULT '',
  "likes" integer NOT NULL DEFAULT 0,
  "posted_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_x_mentions" ON "promo_x_mentions" ("account_id", "post_id");
CREATE INDEX IF NOT EXISTS "ix_promo_x_mentions_user" ON "promo_x_mentions" ("user_id", "first_seen_at" DESC);
