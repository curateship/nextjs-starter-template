CREATE TABLE IF NOT EXISTS "provider_settings" (
  "provider_key" varchar(50) PRIMARY KEY NOT NULL,
  "config" jsonb NOT NULL,
  "secret_encrypted" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "provider_settings_provider_check" CHECK ("provider_key" in ('apify'))
);

CREATE TABLE IF NOT EXISTS "provider_run_configs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "provider_key" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL,
  "input" jsonb NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "provider_run_configs_key_check" CHECK ("provider_key" in ('google-maps')),
  CONSTRAINT "provider_run_configs_status_check" CHECK ("status" in ('draft', 'active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "ix_provider_run_configs_provider_status" ON "provider_run_configs" ("provider_key", "status");

CREATE TABLE IF NOT EXISTS "provider_executions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_config_id" varchar(36) NOT NULL REFERENCES "provider_run_configs"("id") ON DELETE CASCADE,
  "provider_key" varchar(50) NOT NULL,
  "provider_run_id" varchar(255),
  "provider_dataset_id" varchar(255),
  "status" varchar(20) NOT NULL,
  "message" text,
  "error" text,
  "stats" jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "provider_executions_provider_check" CHECK ("provider_key" in ('apify')),
  CONSTRAINT "provider_executions_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'aborted'))
);

CREATE INDEX IF NOT EXISTS "ix_provider_executions_run_config_created" ON "provider_executions" ("run_config_id", "created_at");

CREATE TABLE IF NOT EXISTS "provider_results" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_config_id" varchar(36) NOT NULL REFERENCES "provider_run_configs"("id") ON DELETE CASCADE,
  "execution_id" varchar(36) NOT NULL REFERENCES "provider_executions"("id") ON DELETE CASCADE,
  "external_id" text,
  "title" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_provider_results_execution_id" ON "provider_results" ("execution_id");
CREATE INDEX IF NOT EXISTS "ix_provider_results_run_config_id" ON "provider_results" ("run_config_id");
