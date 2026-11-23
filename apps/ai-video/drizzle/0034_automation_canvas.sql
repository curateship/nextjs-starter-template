-- Automation canvas: user-built node graphs chaining pipeline steps, with a
-- durable run queue (leases + attempts + orphan reclaim, like render_jobs).

CREATE TABLE IF NOT EXISTS "automations" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "graph" jsonb NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "next_run_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_automations_user_id"
  ON "automations" ("user_id");

CREATE INDEX IF NOT EXISTS "ix_automations_next_run"
  ON "automations" ("next_run_at");

CREATE TABLE IF NOT EXISTS "automation_runs" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "automation_id" varchar(36) NOT NULL REFERENCES "automations"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "trigger_type" varchar(20) NOT NULL,
  "trigger_payload" jsonb,
  "nodes" jsonb NOT NULL,
  "edges" jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "error" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "automation_runs_status_check"
    CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  CONSTRAINT "automation_runs_trigger_type_check"
    CHECK ("trigger_type" IN ('manual', 'schedule', 'creator_posted'))
);

-- One active run per automation; duplicate enqueues become no-op conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_automation_runs_automation_active"
  ON "automation_runs" ("automation_id")
  WHERE "status" IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS "ix_automation_runs_status_created"
  ON "automation_runs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "ix_automation_runs_automation_created"
  ON "automation_runs" ("automation_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_automation_runs_user_id"
  ON "automation_runs" ("user_id");

CREATE TABLE IF NOT EXISTS "automation_run_steps" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "run_id" varchar(36) NOT NULL REFERENCES "automation_runs"("id") ON DELETE CASCADE,
  "node_id" varchar(64) NOT NULL,
  "node_kind" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "output" jsonb,
  "error" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "automation_run_steps_status_check"
    CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  CONSTRAINT "automation_run_steps_run_node_unique" UNIQUE ("run_id", "node_id")
);

CREATE INDEX IF NOT EXISTS "ix_automation_run_steps_run_status"
  ON "automation_run_steps" ("run_id", "status");
