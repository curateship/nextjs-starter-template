-- Link each SEO project to a Custom Shell workspace (1:1) so a workspace IS a project.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36)
  REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- A fresh project has no domain until it is configured in Settings.
ALTER TABLE "projects" ALTER COLUMN "domain" DROP NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "normalized_domain" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_projects_workspace_id"
  ON "projects" ("workspace_id") WHERE "workspace_id" IS NOT NULL;

-- Backfill: pair each unlinked project to a distinct workspace of the same user
-- by creation order (links the dev "Demo Site" project to the "My project" workspace).
WITH ranked_projects AS (
  SELECT "id", "user_id",
    row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at") AS rn
  FROM "projects" WHERE "workspace_id" IS NULL
),
ranked_workspaces AS (
  SELECT "id", "user_id",
    row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at") AS rn
  FROM "workspaces"
)
UPDATE "projects" p
SET "workspace_id" = rw."id"
FROM ranked_projects rp
JOIN ranked_workspaces rw ON rw."user_id" = rp."user_id" AND rw."rn" = rp."rn"
WHERE p."id" = rp."id";

-- Authoritative SEO sidebar section: remove any existing one, then prepend the
-- current list. Idempotent and self-healing across the full-migration re-run.
UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  '[{
    "id": "section-keyword-research",
    "title": "SEO",
    "entries": [
      {"type": "item", "id": "item-overview", "label": "Overview", "href": "/", "icon": "layoutDashboard", "visible": true},
      {"type": "item", "id": "item-keywords", "label": "Keywords", "href": "/keywords", "icon": "tag", "visible": true},
      {"type": "item", "id": "item-clusters", "label": "Clusters", "href": "/clusters", "icon": "folderOpen", "visible": true},
      {"type": "item", "id": "item-content-plan", "label": "Content Plan", "href": "/content-plan", "icon": "clipboardCheck", "visible": true},
      {"type": "item", "id": "item-rankings", "label": "Rankings", "href": "/rankings", "icon": "barChart3", "visible": true},
      {"type": "item", "id": "item-competitors", "label": "Competitors", "href": "/competitors", "icon": "users", "visible": true},
      {"type": "item", "id": "item-api-usage", "label": "API Usage", "href": "/usage", "icon": "creditCard", "visible": true}
    ]
  }]'::jsonb || COALESCE(
    (
      SELECT jsonb_agg(section)
      FROM jsonb_array_elements("settings"->'sections') AS section
      WHERE section->>'id' <> 'section-keyword-research'
    ),
    '[]'::jsonb
  )
);
