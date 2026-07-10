-- Automation workflows: persisted canvas graphs plus manual run execution
-- records. Runs snapshot the graph so edits never corrupt run history.

CREATE TABLE IF NOT EXISTS "automation_workflows" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "nodes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "edges" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_automation_workflows_workspace_updated" ON "automation_workflows" ("workspace_id", "updated_at");

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "workflow_id" varchar(36) NOT NULL REFERENCES "automation_workflows"("id") ON DELETE CASCADE,
  "contact_id" varchar(36) REFERENCES "contacts"("id") ON DELETE SET NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "trigger_type" varchar(20) NOT NULL DEFAULT 'manual',
  "nodes" jsonb NOT NULL,
  "edges" jsonb NOT NULL,
  "error" text,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "workflow_runs_status_check" CHECK ("status" in ('running', 'completed', 'failed', 'canceled')),
  CONSTRAINT "workflow_runs_trigger_type_check" CHECK ("trigger_type" in ('manual'))
);

CREATE INDEX IF NOT EXISTS "ix_workflow_runs_workflow_started" ON "workflow_runs" ("workflow_id", "started_at");
CREATE INDEX IF NOT EXISTS "ix_workflow_runs_workspace" ON "workflow_runs" ("workspace_id");

CREATE TABLE IF NOT EXISTS "workflow_run_steps" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "run_id" varchar(36) NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "node_id" varchar(64) NOT NULL,
  "node_type" varchar(50) NOT NULL,
  "node_name" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "output" jsonb,
  "call_id" varchar(36) REFERENCES "calls"("id") ON DELETE SET NULL,
  "error" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "workflow_run_steps_unique_node" UNIQUE("run_id", "node_id"),
  CONSTRAINT "workflow_run_steps_status_check" CHECK ("status" in ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "ix_workflow_run_steps_run_status" ON "workflow_run_steps" ("run_id", "status");
