-- A public page's blocks become rows of their own, one row per block.
--
-- They lived in the settings blob, as a `frontPageRows` array, which had three
-- costs. Only one page could have any, because the blob has room for one list.
-- Every change to one block rewrote the whole settings row, which is how one
-- admin's edit came to erase another's. And a block a visitor reads is content,
-- while the blob is settings.
--
-- Two places held them, and both are read here: a site's own
-- `workspaces.settings->frontPageRows` when the deployment serves several
-- sites, and the app-wide `settings` row keyed `default` when it does not.
--
-- `0051_custom_shell_workspace_pages.sql` did this same move for page
-- visibility and is the shape this file follows: read the old value, write it
-- where it belongs now, then delete the key so there is one place it is saved
-- rather than two that can disagree.

CREATE TABLE IF NOT EXISTS "page_blocks" (
  -- The block's own id, the one the editor and the page both know it by. Not a
  -- key on its own: a block id is unique **within a site**, and copying the
  -- deployment's front page onto two sites would otherwise have to rename one
  -- of them for a reason nobody could see.
  "id" varchar(96) NOT NULL,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- The page this block is on, always starting with "/". A page needs no row
  -- anywhere to exist: it is declared by a `*.page.ts` file beside its route,
  -- and this is only where its blocks are kept.
  "path" varchar(160) NOT NULL,
  -- Where it sits on the page, counted from 0. Stored rather than worked out,
  -- because the order is a thing an admin set and not a thing the database
  -- happens to return.
  "position" integer NOT NULL,
  -- What kind of block it is: one of the shell's own names, or "app" when the
  -- app built on this shell added the kind, in which case "app_kind" names
  -- which of its kinds it is.
  "kind" varchar(40) NOT NULL,
  "app_kind" varchar(60),
  -- Every field of the block except the three above. The same shape the
  -- settings blob held, so what is read back is what was already being drawn.
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("workspace_id", "id")
);

-- How every read asks for them: this site's blocks, on this page, in order.
CREATE INDEX IF NOT EXISTS "ix_page_blocks_workspace_path_position"
  ON "page_blocks" ("workspace_id", "path", "position");

-- A site's own front page ------------------------------------------------
--
-- Only a site that actually built one. A site holding an empty list has no
-- front page on purpose: on a deployment serving several sites, that is a site
-- whose visitors see its header and footer with nothing between them, and
-- filling it with the deployment's own front page would put an advert for this
-- software on somebody else's website.

INSERT INTO "page_blocks" (
  "id", "workspace_id", "path", "position", "kind", "app_kind", "settings",
  "created_at", "updated_at"
)
SELECT
  COALESCE(NULLIF(block.value->>'id', ''), 'front-page-row-' || block.ordinality),
  w."id",
  '/',
  (block.ordinality - 1)::integer,
  COALESCE(NULLIF(block.value->>'kind', ''), 'text'),
  NULLIF(block.value->>'appKind', ''),
  (block.value - 'id' - 'kind' - 'appKind'),
  now(),
  now()
FROM "workspaces" w
CROSS JOIN LATERAL jsonb_array_elements(w."settings"->'frontPageRows')
  WITH ORDINALITY AS block(value, ordinality)
WHERE jsonb_typeof(w."settings"->'frontPageRows') = 'array'
  AND jsonb_array_length(w."settings"->'frontPageRows') > 0
ON CONFLICT DO NOTHING;

-- The app-wide front page ------------------------------------------------
--
-- It goes to the oldest site, because that is the site this deployment answers
-- with when a visitor's address belongs to no site in particular — which is
-- every visitor on a one-site app, and the deployment's own address on a
-- multisite one. Without this, a one-site app would come back from the upgrade
-- with no front page at all, which is the worst thing this file could do.
--
-- Skipped when that site already built its own above: its own front page is
-- the one its visitors are seeing.

INSERT INTO "page_blocks" (
  "id", "workspace_id", "path", "position", "kind", "app_kind", "settings",
  "created_at", "updated_at"
)
SELECT
  COALESCE(NULLIF(block.value->>'id', ''), 'front-page-row-' || block.ordinality),
  oldest."id",
  '/',
  (block.ordinality - 1)::integer,
  COALESCE(NULLIF(block.value->>'kind', ''), 'text'),
  NULLIF(block.value->>'appKind', ''),
  (block.value - 'id' - 'kind' - 'appKind'),
  now(),
  now()
FROM (
  SELECT "id" FROM "workspaces" ORDER BY "created_at", "id" LIMIT 1
) oldest
CROSS JOIN LATERAL (
  SELECT s."settings"->'frontPageRows' AS rows
  FROM "settings" s
  WHERE s."key" = 'default'
    AND jsonb_typeof(s."settings"->'frontPageRows') = 'array'
) app_wide
CROSS JOIN LATERAL jsonb_array_elements(app_wide.rows)
  WITH ORDINALITY AS block(value, ordinality)
WHERE NOT EXISTS (
  SELECT 1 FROM "page_blocks" b WHERE b."workspace_id" = oldest."id"
)
ON CONFLICT DO NOTHING;

-- And out of both blobs ---------------------------------------------------
--
-- Last, so a failure anywhere above leaves the old values exactly where they
-- were and the whole file can be run again.

UPDATE "workspaces"
SET "settings" = "settings" - 'frontPageRows'
WHERE "settings" ? 'frontPageRows';

UPDATE "settings"
SET "settings" = "settings" - 'frontPageRows'
WHERE "key" = 'default' AND "settings" ? 'frontPageRows';
