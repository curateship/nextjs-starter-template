CREATE TABLE IF NOT EXISTS "scraper_provider_settings" (
  "provider_key" varchar(50) PRIMARY KEY NOT NULL,
  "config" jsonb NOT NULL,
  "secret_encrypted" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "scraper_provider_settings_provider_check" CHECK ("provider_key" in ('apify'))
);

CREATE TABLE IF NOT EXISTS "scraper_runs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "scraper_key" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL,
  "input" jsonb NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "scraper_runs_key_check" CHECK ("scraper_key" in ('google-maps')),
  CONSTRAINT "scraper_runs_status_check" CHECK ("status" in ('draft', 'active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "ix_scraper_runs_scraper_status" ON "scraper_runs" ("scraper_key", "status");

CREATE TABLE IF NOT EXISTS "scraper_executions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_id" varchar(36) NOT NULL REFERENCES "scraper_runs"("id") ON DELETE CASCADE,
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
  CONSTRAINT "scraper_executions_provider_check" CHECK ("provider_key" in ('apify')),
  CONSTRAINT "scraper_executions_status_check" CHECK ("status" in ('queued', 'running', 'succeeded', 'failed', 'aborted'))
);

CREATE INDEX IF NOT EXISTS "ix_scraper_executions_run_created" ON "scraper_executions" ("run_id", "created_at");

CREATE TABLE IF NOT EXISTS "scraper_results" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_id" varchar(36) NOT NULL REFERENCES "scraper_runs"("id") ON DELETE CASCADE,
  "execution_id" varchar(36) NOT NULL REFERENCES "scraper_executions"("id") ON DELETE CASCADE,
  "external_id" text,
  "title" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_scraper_results_execution_id" ON "scraper_results" ("execution_id");
CREATE INDEX IF NOT EXISTS "ix_scraper_results_run_id" ON "scraper_results" ("run_id");
