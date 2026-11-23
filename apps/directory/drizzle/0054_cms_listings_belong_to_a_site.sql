-- Listings and categories belong to a site.
--
-- This app's own three tables get the column the shell's already have. It is
-- the last piece of multisite: the shell serves many sites, and until now this
-- app's content sat in one pile behind all of them.
--
-- **The unique indexes are the point, not the column.** A listing's address was
-- unique across the whole deployment, so two sites could not both have a
-- `/directory/joes-diner` — which is not a small limitation, it is the thing
-- that makes running two directories on one deployment impossible. Same for a
-- category's address. Both are dropped and rebuilt with the site in front.
--
-- **What happens to what already exists.** An app upgrading has one site, so
-- every listing and every category lands in it, at the address it already had.
-- Nothing is sorted — there is nothing in a row saying which site it was meant
-- for — and on a deployment that somehow has several they all go to the oldest.

-- Listings -------------------------------------------------------------------

ALTER TABLE "directory_listings" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "directory_listings"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

-- Listings on a deployment with no site at all belong to nothing. It cannot
-- happen — an admin has to sign in to write one, and signing in as an admin
-- makes a site — but dropping them beats blocking the upgrade.
DELETE FROM "directory_listings" WHERE "workspace_id" IS NULL;

ALTER TABLE "directory_listings" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "directory_listings" DROP CONSTRAINT IF EXISTS "directory_listings_workspace_id_workspaces_id_fk";
ALTER TABLE "directory_listings"
  ADD CONSTRAINT "directory_listings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- An address is one listing **within a site**. Two sites each having a
-- `joes-diner` is ordinary; before this it was refused.
DROP INDEX IF EXISTS "directory_listings_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_listings_workspace_slug"
  ON "directory_listings" ("workspace_id", "slug");

DROP INDEX IF EXISTS "ix_directory_listings_status";
CREATE INDEX IF NOT EXISTS "ix_directory_listings_workspace_status"
  ON "directory_listings" ("workspace_id", "status");

DROP INDEX IF EXISTS "ix_directory_listings_updated_at";
CREATE INDEX IF NOT EXISTS "ix_directory_listings_workspace_updated"
  ON "directory_listings" ("workspace_id", "updated_at");

-- Categories -----------------------------------------------------------------

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "categories"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

DELETE FROM "categories" WHERE "workspace_id" IS NULL;

ALTER TABLE "categories" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_workspace_id_workspaces_id_fk";
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "categories_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_categories_workspace_slug"
  ON "categories" ("workspace_id", "slug");

DROP INDEX IF EXISTS "ix_categories_parent_id";
CREATE INDEX IF NOT EXISTS "ix_categories_workspace_parent"
  ON "categories" ("workspace_id", "parent_id");

-- Which categories a listing is in --------------------------------------------
--
-- The column is not strictly needed to keep sites apart — every read reaches
-- these rows through a listing or a category that already named its site. It is
-- here so a site's rows are directly selectable and directly removable, rather
-- than only ever reachable by joining back through one of the other two.

ALTER TABLE "category_relationships" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

-- Filled from the category the row points at, which is the truthful answer
-- rather than a guess: a relationship belongs wherever its category does.
UPDATE "category_relationships" r
SET "workspace_id" = c."workspace_id"
FROM "categories" c
WHERE c."id" = r."category_id" AND r."workspace_id" IS NULL;

DELETE FROM "category_relationships" WHERE "workspace_id" IS NULL;

ALTER TABLE "category_relationships" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "category_relationships" DROP CONSTRAINT IF EXISTS "category_relationships_workspace_id_workspaces_id_fk";
ALTER TABLE "category_relationships"
  ADD CONSTRAINT "category_relationships_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "ix_category_relationships_content";
CREATE INDEX IF NOT EXISTS "ix_category_relationships_workspace_content"
  ON "category_relationships" ("workspace_id", "content_type", "content_id");
