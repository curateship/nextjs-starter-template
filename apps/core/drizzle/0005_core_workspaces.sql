CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_workspaces_user_id" ON "workspaces" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_workspaces_one_default_per_user" ON "workspaces" ("user_id") WHERE "is_default";

ALTER TABLE "scraper_provider_settings" DROP CONSTRAINT IF EXISTS "scraper_provider_settings_pkey";
ALTER TABLE "scraper_provider_settings"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "scraper_provider_settings"
  ADD CONSTRAINT "scraper_provider_settings_pkey" PRIMARY KEY ("workspace_id", "provider_key");

ALTER TABLE "scraper_runs"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "ix_scraper_runs_scraper_status";
CREATE INDEX IF NOT EXISTS "ix_scraper_runs_workspace_scraper_status" ON "scraper_runs" ("workspace_id", "scraper_key", "status");
