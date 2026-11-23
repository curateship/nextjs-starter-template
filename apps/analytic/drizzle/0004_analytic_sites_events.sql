-- Analytic core: registered sites, raw events, and daily aggregates.
-- Idempotent: setup-database.mjs re-runs every .sql file on each db:setup.

CREATE TABLE IF NOT EXISTS "sites" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "domain" varchar(255) NOT NULL,
  "public_id" varchar(32) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_sites_public_id" ON "sites" ("public_id");
CREATE INDEX IF NOT EXISTS "ix_sites_user_id" ON "sites" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_sites_public_id" ON "sites" ("public_id");

CREATE TABLE IF NOT EXISTS "events" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "site_id" varchar(36) NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "page_path" text NOT NULL,
  "referrer_domain" varchar(255),
  "visitor_code" varchar(64),
  "occurred_at" timestamp with time zone NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_events_site_occurred" ON "events" ("site_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "ix_events_site_type" ON "events" ("site_id", "type");

CREATE TABLE IF NOT EXISTS "daily_site_stats" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "site_id" varchar(36) NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "page_views" integer DEFAULT 0 NOT NULL,
  "visitors" integer DEFAULT 0 NOT NULL,
  "pages" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "referrers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_daily_site_stats_site_day" ON "daily_site_stats" ("site_id", "day");
CREATE INDEX IF NOT EXISTS "ix_daily_site_stats_site_day" ON "daily_site_stats" ("site_id", "day");

-- Add an "Analytics" section (Overview + Sites) to the sidebar of any workspace
-- that does not already have it. Prepends so it sits above Platform Settings.
UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  '[{"id":"section-analytics","title":"Analytics","entries":[{"type":"item","id":"item-overview","label":"Overview","href":"/","icon":"barChart3","visible":true},{"type":"item","id":"item-sites","label":"Sites","href":"/sites","icon":"globe","visible":true}]}]'::jsonb
    || COALESCE("settings"->'sections', '[]'::jsonb),
  true
)
WHERE NOT COALESCE("settings"->'sections', '[]'::jsonb) @> '[{"id":"section-analytics"}]'::jsonb;
