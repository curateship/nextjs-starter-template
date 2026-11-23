-- Traffic is counted per site.
--
-- Four tables counted the whole deployment. Every site's `/about` added into
-- one row, so with more than one site the numbers said nothing at all — which
-- is worse than having none, because a number on a screen gets believed.
--
-- The site **joins each table's key** rather than sitting beside it. These
-- tables are keyed by what makes a row unique — a day, a day and a dimension
-- and a key, a day and a visitor — and the site is now part of that. Added
-- beside the key instead, two sites' counts for the same day would fight over
-- one row.
--
-- **What happens to what already exists.** Every counted row goes to the
-- deployment's one site, so an app with one site shows the same figures after
-- this as before. A deployment that somehow has several cannot have the numbers
-- split retrospectively — nothing in the rows says which site they were for —
-- so they all land on the oldest, and that is stated here rather than hidden.
--
-- **The day salt stays shared, on purpose.** It exists so a visitor cannot be
-- followed from one day to the next, and it does that whether or not sites
-- share it. Splitting it per site would mean the same person browsing two of
-- the deployment's sites hashed differently on each, which sounds like more
-- privacy and is not: it counts one person as two, and neither figure is right.
-- The hash never leaves the deployment and is thrown away nightly.

-- Daily totals -------------------------------------------------------------

ALTER TABLE "traffic_daily_totals" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "traffic_daily_totals"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

-- A deployment with counted days but no site at all has nothing to attribute
-- them to. Those rows are dropped rather than blocking the upgrade: they are
-- counts of visits to an app nobody had finished setting up.
DELETE FROM "traffic_daily_totals" WHERE "workspace_id" IS NULL;

ALTER TABLE "traffic_daily_totals" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "traffic_daily_totals" DROP CONSTRAINT IF EXISTS "traffic_daily_totals_pkey";
ALTER TABLE "traffic_daily_totals"
  ADD CONSTRAINT "traffic_daily_totals_pkey" PRIMARY KEY ("workspace_id", "day");

ALTER TABLE "traffic_daily_totals" DROP CONSTRAINT IF EXISTS "traffic_daily_totals_workspace_id_workspaces_id_fk";
ALTER TABLE "traffic_daily_totals"
  ADD CONSTRAINT "traffic_daily_totals_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- Daily facts ---------------------------------------------------------------

ALTER TABLE "traffic_daily_facts" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "traffic_daily_facts"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

DELETE FROM "traffic_daily_facts" WHERE "workspace_id" IS NULL;

ALTER TABLE "traffic_daily_facts" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "traffic_daily_facts" DROP CONSTRAINT IF EXISTS "traffic_daily_facts_pk";
ALTER TABLE "traffic_daily_facts"
  ADD CONSTRAINT "traffic_daily_facts_pk"
  PRIMARY KEY ("workspace_id", "day", "dimension", "key");

ALTER TABLE "traffic_daily_facts" DROP CONSTRAINT IF EXISTS "traffic_daily_facts_workspace_id_workspaces_id_fk";
ALTER TABLE "traffic_daily_facts"
  ADD CONSTRAINT "traffic_daily_facts_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- The visit log -------------------------------------------------------------

ALTER TABLE "traffic_visits" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "traffic_visits"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

DELETE FROM "traffic_visits" WHERE "workspace_id" IS NULL;

ALTER TABLE "traffic_visits" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "traffic_visits" DROP CONSTRAINT IF EXISTS "traffic_visits_workspace_id_workspaces_id_fk";
ALTER TABLE "traffic_visits"
  ADD CONSTRAINT "traffic_visits_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "ix_traffic_visits_occurred_at";
CREATE INDEX IF NOT EXISTS "ix_traffic_visits_workspace_occurred"
  ON "traffic_visits" ("workspace_id", "occurred_at");

-- Who has been seen today ---------------------------------------------------
--
-- Per site, so "unique visitors" means unique to that site. One person reading
-- both of the deployment's sites is one visitor on each, which is what each
-- site's own figure should say.

ALTER TABLE "traffic_visitors" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "traffic_visitors"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

DELETE FROM "traffic_visitors" WHERE "workspace_id" IS NULL;

ALTER TABLE "traffic_visitors" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "traffic_visitors" DROP CONSTRAINT IF EXISTS "traffic_visitors_pk";
ALTER TABLE "traffic_visitors"
  ADD CONSTRAINT "traffic_visitors_pk"
  PRIMARY KEY ("workspace_id", "day", "visitor_hash");

ALTER TABLE "traffic_visitors" DROP CONSTRAINT IF EXISTS "traffic_visitors_workspace_id_workspaces_id_fk";
ALTER TABLE "traffic_visitors"
  ADD CONSTRAINT "traffic_visitors_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
