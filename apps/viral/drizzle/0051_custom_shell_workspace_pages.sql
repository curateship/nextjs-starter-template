-- Written pages and automations belong to a site.
--
-- These two are the hard ones, and for different reasons.
--
-- A written page's address was unique across the whole deployment, so two sites
-- could not both have an `/about`. That is the single index below, dropped and
-- rebuilt with the workspace in front of it — which is the difference between
-- a deployment that can serve several sites and one that cannot.
--
-- An automation belonged to a **person**, and a run worked out which site it
-- was for by asking that person which site they happened to be in when it
-- started. So an admin switching site changed what a flow already running would
-- do, and an admin leaving took the answer with them. A flow gets a site of its
-- own here, and from then on a run reads the flow's site rather than anybody's
-- current one.
--
-- **What happens to what already exists.** An app upgrading has one workspace,
-- so every page and every flow lands in it, at the address and with the name it
-- already had. A flow follows its author where a deployment somehow has several,
-- and falls back to the oldest site when its author is in none.

-- Written pages -------------------------------------------------------------

ALTER TABLE "written_pages" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "written_pages"
SET "workspace_id" = (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
WHERE "workspace_id" IS NULL;

ALTER TABLE "written_pages" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "written_pages" DROP CONSTRAINT IF EXISTS "written_pages_workspace_id_workspaces_id_fk";
ALTER TABLE "written_pages"
  ADD CONSTRAINT "written_pages_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- The whole point: an address is one page **within a site**, and Alpha's
-- `/about` and Beta's `/about` are two different pages.
DROP INDEX IF EXISTS "written_pages_path_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_written_pages_workspace_path"
  ON "written_pages" ("workspace_id", "path");

-- Which pages are hidden moves onto the site --------------------------------
--
-- It lived in the one app-wide settings row, keyed by the bare address, so one
-- site switching its pricing page off switched every site's off. It is a
-- per-site decision and is saved per site from here on.
--
-- **Carried over rather than dropped.** Without this, an install where an admin
-- had hidden a page would come back from the upgrade with that page on the
-- internet again — a setting quietly undoing itself, which is the worst way for
-- one to change. Every existing site inherits the app-wide answer, which is
-- exactly what it was already showing.

UPDATE "workspaces" w
SET "settings" = jsonb_set(
  COALESCE(w."settings", '{}'::jsonb),
  '{pages}',
  COALESCE((SELECT s."settings"->'pages' FROM "settings" s WHERE s."key" = 'default'), '{}'::jsonb)
)
WHERE NOT (COALESCE(w."settings", '{}'::jsonb) ? 'pages')
  AND EXISTS (
    SELECT 1 FROM "settings" s
    WHERE s."key" = 'default' AND s."settings" ? 'pages'
  );

-- And out of the app-wide row, so there is one place it is saved rather than
-- two that can disagree.
UPDATE "settings"
SET "settings" = "settings" - 'pages'
WHERE "key" = 'default' AND "settings" ? 'pages';

-- Automations ---------------------------------------------------------------

ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "automations" a
SET "workspace_id" = COALESCE(
  (SELECT u."current_workspace_id" FROM "users" u WHERE u."id" = a."user_id"),
  (SELECT w."id" FROM "workspaces" w ORDER BY w."created_at" LIMIT 1)
)
WHERE a."workspace_id" IS NULL;

ALTER TABLE "automations" ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_workspace_id_workspaces_id_fk";
ALTER TABLE "automations"
  ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- Two flows on one site cannot share a name, and two sites naming their flows
-- the same way is ordinary rather than a clash. The old rule was one name per
-- person, which stopped one admin running the same flow on two of their sites.
--
-- **Names have to be made unique before the rule can be added.** The old rule
-- allowed two admins to each have a "Welcome email"; they land in the same site
-- here, and the new rule would refuse them — aborting the whole upgrade. The
-- oldest keeps the name it had and the rest get a number, which is a rename
-- somebody may want to change afterwards but never a failed migration.
WITH "clashes" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspace_id", "name" ORDER BY "created_at", "id"
    ) AS "position"
  FROM "automations"
)
UPDATE "automations" a
SET "name" = LEFT(a."name", 74) || ' (' || c."position" || ')'
FROM "clashes" c
WHERE a."id" = c."id" AND c."position" > 1;

ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_user_name_unique";
DROP INDEX IF EXISTS "automations_user_name_unique";
ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_workspace_name_unique";
ALTER TABLE "automations"
  ADD CONSTRAINT "automations_workspace_name_unique" UNIQUE ("workspace_id", "name");

DROP INDEX IF EXISTS "ix_automations_user_updated";
CREATE INDEX IF NOT EXISTS "ix_automations_workspace_updated"
  ON "automations" ("workspace_id", "updated_at");

-- Every run already carries the site it started in, from
-- `0047_custom_shell_current_workspace.sql`. What changes above it is where
-- that value comes from: the flow's site, not whichever site its author was
-- looking at.
--
-- Runs saved before that column existed have nothing in it, and run history is
-- read per site from here on — so those runs would drop off the screen
-- entirely. Now that the flow itself has a site, they can be given one: the
-- site of the flow they belong to, which is the truthful answer.
UPDATE "automation_runs" r
SET "workspace_id" = a."workspace_id"
FROM "automations" a
WHERE a."id" = r."automation_id" AND r."workspace_id" IS NULL;

-- A flow outlives the person who made it ------------------------------------
--
-- `user_id` cascaded, so deleting an admin's account deleted their flows and
-- every run those flows had ever done. On one site that was merely careless.
-- Once a site's flows are the site's, it is the same fault
-- `0045_custom_shell_shared_workspaces.sql` fixed for the workspace itself: one
-- person leaving must not take a site's machinery with them. The column stays,
-- because who wrote a flow is worth knowing — it just stops deciding whether
-- the flow lives.
--
-- The constraint is looked up rather than named: the original was written
-- inline with no name of its own, so Postgres picked one, and dropping a
-- guessed name would silently do nothing at all.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE rel.relname = 'automations'
    AND con.contype = 'f'
    AND att.attname = 'user_id'
    AND array_length(con.conkey, 1) = 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "automations" DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE "automations" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "automations"
  ADD CONSTRAINT "automations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE rel.relname = 'automation_runs'
    AND con.contype = 'f'
    AND att.attname = 'user_id'
    AND array_length(con.conkey, 1) = 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "automation_runs" DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE "automation_runs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Run history is read per site now, not per person.
DROP INDEX IF EXISTS "ix_automation_runs_user_started";
CREATE INDEX IF NOT EXISTS "ix_automation_runs_workspace_started"
  ON "automation_runs" ("workspace_id", "started_at");
