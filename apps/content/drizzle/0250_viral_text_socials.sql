-- What a project keeps reading on X, Reddit and LinkedIn through Promo:
-- its searches, hashtags, accounts, people, companies and subreddits
-- (workspace/docs/projects-and-socials.md). Each read Promo makes is a row in
-- viral_promo_reads; a watch's state is its newest read with the same
-- network, kind and value.
CREATE TABLE IF NOT EXISTS "viral_social_watches" (
  "id" varchar(36) PRIMARY KEY,
  "owner_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "viral_projects"("id") ON DELETE CASCADE,
  -- x, reddit or linkedin.
  "network" varchar(20) NOT NULL,
  -- search, hashtag, account, person, company or subreddit.
  "kind" varchar(20) NOT NULL,
  "value" varchar(300) NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_viral_social_watches_value" ON "viral_social_watches" ("project_id", "network", "kind", lower("value"));
CREATE INDEX IF NOT EXISTS "ix_viral_promo_reads_watch" ON "viral_promo_reads" ("project_id", "network", "kind", "value", "created_at");
