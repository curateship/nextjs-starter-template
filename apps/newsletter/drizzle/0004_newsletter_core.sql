CREATE TABLE IF NOT EXISTS "newsletter_contacts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "first_name" varchar(255),
  "last_name" varchar(255),
  "source" varchar(255),
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'subscribed' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_contacts_status_check" CHECK ("status" in ('subscribed', 'unsubscribed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_newsletter_contacts_workspace_email"
  ON "newsletter_contacts" ("workspace_id", lower("email"));
CREATE INDEX IF NOT EXISTS "ix_newsletter_contacts_workspace_created"
  ON "newsletter_contacts" ("workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "newsletter_connections" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "app_key" varchar(100) NOT NULL,
  "secret_hash" varchar(64) NOT NULL,
  "secret_prefix" varchar(12) NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_newsletter_connections_secret_hash"
  ON "newsletter_connections" ("secret_hash");
CREATE INDEX IF NOT EXISTS "ix_newsletter_connections_workspace"
  ON "newsletter_connections" ("workspace_id");

CREATE TABLE IF NOT EXISTS "newsletter_automations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "compiled_config" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_automations_status_check" CHECK ("status" in ('draft', 'active', 'paused')),
  CONSTRAINT "ux_newsletter_automations_workspace_name" UNIQUE ("workspace_id", "name")
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_automations_workspace_status"
  ON "newsletter_automations" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "newsletter_automation_runs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "automation_id" varchar(36) NOT NULL REFERENCES "newsletter_automations"("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL REFERENCES "newsletter_contacts"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "current_node_id" varchar(100) NOT NULL,
  "config_snapshot" jsonb NOT NULL,
  "wake_at" timestamp with time zone NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "claim_token" varchar(36),
  "claimed_at" timestamp with time zone,
  "error" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_runs_status_check" CHECK ("status" in ('active', 'waiting', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "ux_newsletter_runs_automation_contact" UNIQUE ("automation_id", "contact_id")
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_runs_status_wake"
  ON "newsletter_automation_runs" ("status", "wake_at");
CREATE INDEX IF NOT EXISTS "ix_newsletter_runs_workspace"
  ON "newsletter_automation_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ix_newsletter_runs_contact"
  ON "newsletter_automation_runs" ("contact_id");

CREATE TABLE IF NOT EXISTS "newsletter_automation_run_steps" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "run_id" varchar(36) NOT NULL REFERENCES "newsletter_automation_runs"("id") ON DELETE CASCADE,
  "node_id" varchar(100) NOT NULL,
  "kind" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "output" jsonb,
  "error" text,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_run_steps_status_check" CHECK ("status" in ('completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_run_steps_run"
  ON "newsletter_automation_run_steps" ("run_id", "started_at");

CREATE TABLE IF NOT EXISTS "newsletter_deliveries" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "run_id" varchar(36) REFERENCES "newsletter_automation_runs"("id") ON DELETE SET NULL,
  "contact_id" varchar(36) NOT NULL REFERENCES "newsletter_contacts"("id") ON DELETE CASCADE,
  "to_email" varchar(255) NOT NULL,
  "subject" text NOT NULL,
  "provider_message_id" varchar(255),
  "status" varchar(20) NOT NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_deliveries_status_check" CHECK ("status" in ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_deliveries_workspace_created"
  ON "newsletter_deliveries" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_newsletter_deliveries_contact"
  ON "newsletter_deliveries" ("contact_id");

CREATE TABLE IF NOT EXISTS "newsletter_email_settings" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "resend_api_key_encrypted" text,
  "from_email" varchar(255),
  "from_name" varchar(255),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
