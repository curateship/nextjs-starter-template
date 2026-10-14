-- A workspace gets an address of its own.
--
-- Three columns turn a workspace into something a visitor can reach: the label
-- it answers on, an optional domain of its own, and whether it answers at all.
-- Nothing about a deployment with one workspace changes — there is no base
-- domain configured by default, so every request is still the app itself.
--
-- The subdomain is required and unique, because it is how an incoming host is
-- turned back into one workspace. Existing rows are given one derived from
-- their name, so nothing that exists today breaks. Names are not unique and
-- "My project" is the default for every workspace ever made, so a number is
-- appended where two would collide.

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "subdomain" varchar(63),
  -- Stored bare: no scheme, no port, no "www.", because that is the shape an
  -- incoming host is reduced to before it is matched. Empty means the workspace
  -- answers only on its subdomain.
  ADD COLUMN IF NOT EXISTS "custom_domain" varchar(253) NOT NULL DEFAULT '',
  -- "active" and "draft" both answer a visitor; "inactive" looks like the
  -- workspace never existed. Draft answers on purpose — it is how a site gets
  -- looked at before anybody is told about it. Existing workspaces start
  -- active, because they are already in use.
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'active';

-- Derive an address for every workspace that has none: the name, lowercased,
-- with anything that is not a letter or digit turned into a hyphen, trimmed to
-- the DNS label rules. A number goes on the end where that collides, and the
-- id's first characters are the fallback when a name gives nothing usable.
WITH "derived" AS (
  SELECT
    "id",
    NULLIF(
      TRIM(BOTH '-' FROM SUBSTRING(LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g')) FROM 1 FOR 63)),
      ''
    ) AS "base",
    ROW_NUMBER() OVER (
      PARTITION BY NULLIF(
        TRIM(BOTH '-' FROM SUBSTRING(LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g')) FROM 1 FOR 63)),
        ''
      )
      ORDER BY "created_at"
    ) AS "position"
  FROM "workspaces"
  WHERE "subdomain" IS NULL
)
UPDATE "workspaces" w
SET "subdomain" = CASE
  WHEN d."base" IS NULL THEN 'w-' || SUBSTRING(w."id" FROM 1 FOR 8)
  WHEN LENGTH(d."base") < 3 THEN d."base" || '-' || d."position"
  WHEN d."position" = 1 THEN d."base"
  ELSE SUBSTRING(d."base" FROM 1 FOR 57) || '-' || d."position"
END
FROM "derived" d
WHERE w."id" = d."id";

-- A workspace called "Admin" or "App" would derive an address the app keeps for
-- itself, and that address always answers as the app — so the workspace would
-- exist and be reachable by nobody. The id makes the replacement unique without
-- another pass over the table.
UPDATE "workspaces"
SET "subdomain" = "subdomain" || '-' || SUBSTRING("id" FROM 1 FOR 8)
WHERE "subdomain" IN ('www', 'api', 'admin', 'app');

ALTER TABLE "workspaces" ALTER COLUMN "subdomain" SET NOT NULL;

ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_subdomain_check";
ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_subdomain_check" CHECK (
    "subdomain" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND length("subdomain") >= 3
  );

ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_status_check";
ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_status_check" CHECK ("status" IN ('active', 'inactive', 'draft'));

-- Two workspaces cannot share an address: it is how a visitor's host is turned
-- back into one of them.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_workspaces_subdomain" ON "workspaces" ("subdomain");

-- The same for a domain of its own, but only where there is one — every
-- workspace without one keeps the empty string, and those must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_workspaces_custom_domain"
  ON "workspaces" ("custom_domain")
  WHERE "custom_domain" <> '';
