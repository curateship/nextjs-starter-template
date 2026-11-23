-- Medium as a network (workspace/tasks/Medium/01-medium-features.md): its
-- keywords, the stories they find, the responses and articles that went out,
-- each article's daily numbers, the publications a project writes for, and
-- the stories kept on an account's public Medium list.
--
-- Additions only. Nothing stored is renamed or dropped.

-- When Medium says the account joined, read off its own profile after every
-- job. Its 7-day warm-up and its 90 young days count from here. Null until read.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "medium_joined_at" timestamptz;

-- The networks of a project that are paused on their own, while the rest of
-- the project keeps running (part 5).
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "paused_networks" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- A Medium keyword: a tag, search words, a publication or a writer. `mark` is
-- '' for an ordinary one, 'you' when the words are the product's own name and
-- 'rival' when they are a rival's (part 13).
CREATE TABLE IF NOT EXISTS "promo_medium_keywords" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE RESTRICT,
  "kind" varchar(20) NOT NULL,
  "value" varchar(200) NOT NULL,
  "mark" varchar(10) NOT NULL DEFAULT '',
  "enabled" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamptz,
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_keywords_project" ON "promo_medium_keywords" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_medium_keywords_value"
  ON "promo_medium_keywords" ("project_id", "kind", lower("value"));

-- A Medium story a keyword found, and what was decided about it. One row per
-- story per keyword, so a search again updates rather than duplicates.
CREATE TABLE IF NOT EXISTS "promo_medium_finds" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "promo_medium_keywords"("id") ON DELETE CASCADE,
  "story_id" varchar(16) NOT NULL,
  "url" varchar(600) NOT NULL,
  "title" varchar(600) NOT NULL DEFAULT '',
  "subtitle" text NOT NULL DEFAULT '',
  "writer_id" varchar(40) NOT NULL DEFAULT '',
  "writer_handle" varchar(120) NOT NULL DEFAULT '',
  "writer_name" varchar(200) NOT NULL DEFAULT '',
  "writer_followers" integer,
  "publication_slug" varchar(120) NOT NULL DEFAULT '',
  "publication_name" varchar(200) NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "posted_at" timestamptz,
  "claps" integer NOT NULL DEFAULT 0,
  "response_count" integer NOT NULL DEFAULT 0,
  "members_only" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "rank" numeric(10, 4) NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'new',
  "text" text NOT NULL DEFAULT '',
  "responses" jsonb,
  "story_read_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_medium_finds_keyword_story" ON "promo_medium_finds" ("keyword_id", "story_id");
CREATE INDEX IF NOT EXISTS "ix_promo_medium_finds_user_status" ON "promo_medium_finds" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_promo_medium_finds_status_seen" ON "promo_medium_finds" ("status", "last_seen_at");
CREATE INDEX IF NOT EXISTS "ix_promo_medium_finds_story" ON "promo_medium_finds" ("user_id", "story_id");

-- Writers and publications whose stories are never shown again (part 10).
CREATE TABLE IF NOT EXISTS "promo_medium_hidden" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "value" varchar(120) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_medium_hidden" ON "promo_medium_hidden" ("user_id", "kind", lower("value"));

-- What the AI wrote for a story, kept after sending so what was asked for and
-- what went out can be compared.
CREATE TABLE IF NOT EXISTS "promo_medium_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "find_id" varchar(36) REFERENCES "promo_medium_finds"("id") ON DELETE CASCADE,
  "text" text NOT NULL,
  "line" text NOT NULL DEFAULT '',
  "help_only" boolean NOT NULL DEFAULT false,
  "rewrite" varchar(20) NOT NULL DEFAULT '',
  "provider" varchar(30) NOT NULL DEFAULT '',
  "model" varchar(120) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_drafts_find" ON "promo_medium_drafts" ("find_id", "created_at" DESC);

-- A Medium article written in Promo, from a draft to live on Medium.
CREATE TABLE IF NOT EXISTS "promo_medium_articles" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL DEFAULT '',
  "subtitle" varchar(300) NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cover_url" varchar(2048) NOT NULL DEFAULT '',
  "publication_slug" varchar(120) NOT NULL DEFAULT '',
  "outline" jsonb,
  "source" varchar(80) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "job_id" varchar(36),
  "story_id" varchar(16) NOT NULL DEFAULT '',
  "url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "views" integer,
  "reads" integer,
  "claps" integer,
  "responses" integer,
  "incoming" jsonb,
  "still_visible" boolean,
  "numbers_read_at" timestamptz,
  "deleted_at" timestamptz,
  "edited_at" timestamptz,
  "sent_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "published_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_articles_project" ON "promo_medium_articles" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_articles_account" ON "promo_medium_articles" ("account_id", "created_at" DESC);

-- A response that went out, or tried to: on a story, or an answer to
-- somebody who responded under one of ours or under one of our articles.
CREATE TABLE IF NOT EXISTS "promo_medium_responses" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "promo_projects"("id") ON DELETE SET NULL,
  "find_id" varchar(36) REFERENCES "promo_medium_finds"("id") ON DELETE SET NULL,
  "draft_id" varchar(36) REFERENCES "promo_medium_drafts"("id") ON DELETE SET NULL,
  "parent_id" varchar(36) REFERENCES "promo_medium_responses"("id") ON DELETE CASCADE,
  "article_id" varchar(36) REFERENCES "promo_medium_articles"("id") ON DELETE CASCADE,
  "reply_to" jsonb,
  "story_id" varchar(16) NOT NULL,
  "story_url" varchar(600) NOT NULL DEFAULT '',
  "story_title" varchar(600) NOT NULL DEFAULT '',
  "text" text NOT NULL,
  "line" text NOT NULL DEFAULT '',
  "help_only" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "response_id" varchar(16) NOT NULL DEFAULT '',
  "response_url" varchar(600) NOT NULL DEFAULT '',
  "last_error" text NOT NULL DEFAULT '',
  "claps" integer,
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
CREATE INDEX IF NOT EXISTS "ix_promo_medium_responses_account" ON "promo_medium_responses" ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_responses_project" ON "promo_medium_responses" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_promo_medium_responses_story" ON "promo_medium_responses" ("user_id", "story_id");

-- One reading a day of an article's numbers, so its week-by-week chart has a
-- history (part 40). The newest reading also sits on the article.
CREATE TABLE IF NOT EXISTS "promo_medium_article_readings" (
  "article_id" varchar(36) NOT NULL REFERENCES "promo_medium_articles"("id") ON DELETE CASCADE,
  "read_on" date NOT NULL,
  "views" integer,
  "reads" integer,
  "claps" integer,
  "responses" integer,
  PRIMARY KEY ("article_id", "read_on")
);

-- A Medium publication that suits a project, which of the project's accounts
-- write for it as Medium last said, and its submission rules (parts 32, 33).
CREATE TABLE IF NOT EXISTS "promo_medium_publications" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "slug" varchar(120) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "rules" text NOT NULL DEFAULT '',
  "rules_read_at" timestamptz,
  "writers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "writers_read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_medium_publications" ON "promo_medium_publications" ("project_id", lower("slug"));

-- A story on an account's public Medium list (part 34).
CREATE TABLE IF NOT EXISTS "promo_medium_list_items" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" varchar(36) NOT NULL REFERENCES "promo_accounts"("id") ON DELETE CASCADE,
  "story_id" varchar(16) NOT NULL,
  "story_url" varchar(600) NOT NULL DEFAULT '',
  "title" varchar(600) NOT NULL DEFAULT '',
  "own" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "last_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "added_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_medium_list_items" ON "promo_medium_list_items" ("account_id", "story_id");
