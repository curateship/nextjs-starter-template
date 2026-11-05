-- The link between Promo and the Viral app (apps/viral task features/01,
-- parts 11 to 14, 20 and 21): the key Viral calls with, the reads Viral asks
-- for, the posts it writes for Promo, and the posts Promo reported back.
-- Additions only. Nothing stored is renamed or dropped.

CREATE TABLE IF NOT EXISTS "promo_viral_links" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  -- The key's hash, to find who is calling, and the key scrambled, for Copy
  -- and for calling Viral back.
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_secret" text NOT NULL,
  -- The Viral address that last pressed Test. Promo calls only it.
  "viral_url" varchar(500) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

-- One read Viral asked for: a search, an account, a person, a page or a
-- subreddit, run by Promo's own readers and answered back to Viral.
CREATE TABLE IF NOT EXISTS "promo_viral_reads" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Viral's own id for the read, which every answer names.
  "read_id" varchar(64) NOT NULL,
  -- x, linkedin or reddit.
  "network" varchar(20) NOT NULL,
  -- search, hashtag, account, person, company or subreddit.
  "kind" varchar(20) NOT NULL,
  "value" varchar(300) NOT NULL,
  -- waiting, done or failed.
  "status" varchar(10) NOT NULL DEFAULT 'waiting',
  "job_id" varchar(36),
  "posts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  -- When Viral last heard the answer. Null until it has.
  "delivered_at" timestamptz,
  "delivery_tries" integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_viral_reads_read" ON "promo_viral_reads" ("user_id", "read_id");
CREATE INDEX IF NOT EXISTS "ix_promo_viral_reads_due" ON "promo_viral_reads" ("status", "delivered_at");

-- A post Viral wrote for a Promo project. An X or LinkedIn one is also a
-- draft on that network's Posts tab, named by promo_post_id. A Reddit one
-- waits here until New post opens with it, because Reddit posts have no
-- drafts of their own.
CREATE TABLE IF NOT EXISTS "promo_viral_drafts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects"("id") ON DELETE CASCADE,
  "send_id" varchar(64) NOT NULL,
  "network" varchar(20) NOT NULL,
  -- The Viral vault idea it was written from.
  "idea_id" varchar(64) NOT NULL DEFAULT '',
  "title" varchar(300) NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  -- The X or LinkedIn draft it made, or '' for Reddit.
  "promo_post_id" varchar(36) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "used_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_viral_drafts_send" ON "promo_viral_drafts" ("user_id", "send_id");
CREATE INDEX IF NOT EXISTS "ix_promo_viral_drafts_project" ON "promo_viral_drafts" ("project_id", "created_at");

-- A post that came from a Viral idea, once Promo told Viral about it. The key
-- names Promo's own row, such as x:<id> or app:<id>.
CREATE TABLE IF NOT EXISTS "promo_viral_reports" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "post_key" varchar(60) NOT NULL,
  "idea_id" varchar(64) NOT NULL,
  -- The views last told to Viral, and when, so a figure is sent at most daily.
  "views" integer,
  "reported_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "post_key")
);

-- The Viral idea a video sent from Video started as, so a post made from it
-- can be reported back. "" for anything else.
ALTER TABLE "promo_archive_items" ADD COLUMN IF NOT EXISTS "viral_idea_id" varchar(64) NOT NULL DEFAULT '';
