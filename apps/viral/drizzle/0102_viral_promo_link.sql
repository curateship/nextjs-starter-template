-- The link with the Promo app (task features/01, parts 11 to 14, 20 and 21):
-- Promo's address and key, the reads Viral asks Promo for and the posts they
-- found, the posts Viral writes for Promo, and the posts Promo reports back
-- for an idea. Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "promo_url" text NOT NULL DEFAULT '';
ALTER TABLE "viral_settings" ADD COLUMN IF NOT EXISTS "promo_key" text;

-- One read Viral asked Promo for. Promo answers it back when it is done.
CREATE TABLE IF NOT EXISTS "viral_promo_reads" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- The project it is for. A read of one post is for the project showing it.
  "project_id" varchar(36) NOT NULL REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  -- x, linkedin or reddit.
  "network" varchar(20) NOT NULL,
  -- search, hashtag, account, person, company, subreddit or post.
  "kind" varchar(20) NOT NULL,
  "value" varchar(300) NOT NULL,
  -- waiting, done or failed.
  "status" varchar(10) NOT NULL DEFAULT 'waiting',
  "error" text NOT NULL DEFAULT '',
  "found" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "finished_at" timestamptz,
  CONSTRAINT "ck_viral_promo_reads_status" CHECK ("status" in ('waiting', 'done', 'failed'))
);
CREATE INDEX IF NOT EXISTS "ix_viral_promo_reads_project" ON "viral_promo_reads" ("project_id", "created_at");

-- A post a read found on X, LinkedIn or Reddit. The same post in one project
-- is one row, kept fresh by later reads.
CREATE TABLE IF NOT EXISTS "viral_social_posts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  "read_id" varchar(36) REFERENCES "viral_promo_reads"("id") ON DELETE SET NULL,
  "network" varchar(20) NOT NULL,
  "post_id" varchar(40) NOT NULL,
  "url" varchar(300) NOT NULL,
  -- A Reddit post's title, or ''.
  "title" text NOT NULL DEFAULT '',
  "text" text NOT NULL DEFAULT '',
  "author_handle" varchar(60) NOT NULL DEFAULT '',
  "author_name" varchar(200) NOT NULL DEFAULT '',
  "author_followers" bigint,
  "posted_at" timestamptz,
  "views" bigint,
  "likes" bigint,
  "replies" bigint,
  "reposts" bigint,
  "link" text NOT NULL DEFAULT '',
  -- A subreddit's name for Reddit, or ''.
  "community" varchar(60) NOT NULL DEFAULT '',
  -- The top replies, once the post itself has been read.
  "top_replies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "replies_read_at" timestamptz,
  "first_seen_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_social_posts_project_post" ON "viral_social_posts" ("project_id", "network", "post_id");
CREATE INDEX IF NOT EXISTS "ix_viral_social_posts_owner" ON "viral_social_posts" ("owner_id", "network");

-- A post Viral wrote from a vault idea and left in a Promo project.
CREATE TABLE IF NOT EXISTS "viral_promo_sends" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "vault_item_id" varchar(36) NOT NULL REFERENCES "viral_vault_items"("id") ON DELETE CASCADE,
  -- x, threads, linkedin or reddit. A Threads post is written but never sent, because Promo has no Threads.
  "network" varchar(20) NOT NULL,
  "promo_project_id" varchar(36),
  "title" text NOT NULL DEFAULT '',
  -- One piece for a post, several for an X thread.
  "pieces" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- written, sent or failed.
  "status" varchar(10) NOT NULL DEFAULT 'written',
  "draft_url" text,
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  "sent_at" timestamptz,
  CONSTRAINT "ck_viral_promo_sends_status" CHECK ("status" in ('written', 'sent', 'failed'))
);
CREATE INDEX IF NOT EXISTS "ix_viral_promo_sends_item" ON "viral_promo_sends" ("vault_item_id", "created_at");

-- Your own post of a vault idea, as Promo reported it, with its latest views.
CREATE TABLE IF NOT EXISTS "viral_vault_posts" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "vault_item_id" varchar(36) NOT NULL REFERENCES "viral_vault_items"("id") ON DELETE CASCADE,
  -- Promo's own name for the post, such as x:<id>, so a later report updates it.
  "post_key" varchar(60) NOT NULL,
  "network" varchar(20) NOT NULL,
  "url" text NOT NULL,
  "views" bigint,
  "likes" bigint,
  "comments" bigint,
  "posted_at" timestamptz,
  "figures_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_vault_posts_key" ON "viral_vault_posts" ("owner_id", "post_key");
CREATE INDEX IF NOT EXISTS "ix_viral_vault_posts_item" ON "viral_vault_posts" ("vault_item_id");
