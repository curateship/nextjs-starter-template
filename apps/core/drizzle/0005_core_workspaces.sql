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

ALTER TABLE "provider_settings" DROP CONSTRAINT IF EXISTS "provider_settings_pkey";
ALTER TABLE "provider_settings"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "provider_settings"
  ADD CONSTRAINT "provider_settings_pkey" PRIMARY KEY ("workspace_id", "provider_key");

ALTER TABLE "provider_run_configs"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "ix_provider_run_configs_provider_status";
CREATE INDEX IF NOT EXISTS "ix_provider_run_configs_workspace_provider_status" ON "provider_run_configs" ("workspace_id", "provider_key", "status");
