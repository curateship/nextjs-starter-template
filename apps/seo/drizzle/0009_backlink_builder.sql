CREATE TABLE IF NOT EXISTS "backlink_prospects" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "referring_domain" text NOT NULL,
  "normalized_domain" text NOT NULL,
  "domain_rank" integer,
  "backlinks_count" integer,
  "referring_to" jsonb,
  "status" text DEFAULT 'new' NOT NULL,
  "contact_url" text,
  "contact_email" text,
  "notes" text,
  "discovered_via" text DEFAULT 'domain_intersection' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "backlink_prospects_project_id_normalized_domain_key"
    UNIQUE ("project_id", "normalized_domain"),
  CONSTRAINT "backlink_prospects_status_check" CHECK (
    "status" in ('new', 'qualified', 'contacted', 'replied', 'won', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS "idx_backlink_prospects_project_status"
  ON "backlink_prospects" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "idx_backlink_prospects_project_rank"
  ON "backlink_prospects" ("project_id", "domain_rank" DESC);

-- Latest own-domain backlink profile per project (no history in MVP).
CREATE TABLE IF NOT EXISTS "backlink_snapshots" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "target" text NOT NULL,
  "domain_rank" integer,
  "backlinks" integer,
  "referring_domains" integer,
  "referring_pages" integer,
  "broken_backlinks" integer,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "backlink_snapshots_project_id_key" UNIQUE ("project_id")
);

-- Authoritative SEO sidebar section: remove any existing one, then prepend the
-- current list (adds Alerts + Backlinks). Idempotent across the re-run.
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
      {"type": "item", "id": "item-alerts", "label": "Alerts", "href": "/alerts", "icon": "bell", "visible": true},
      {"type": "item", "id": "item-competitors", "label": "Competitors", "href": "/competitors", "icon": "users", "visible": true},
      {"type": "item", "id": "item-backlinks", "label": "Backlinks", "href": "/backlinks", "icon": "link", "visible": true},
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
