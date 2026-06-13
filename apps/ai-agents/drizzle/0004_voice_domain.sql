-- Voice agent domain: contacts CRM, agents, phone numbers, campaigns, calls.
-- All tables are workspace-scoped for future multi-tenancy.

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "first_name" varchar(255) NOT NULL,
  "last_name" varchar(255),
  "phone" varchar(32) NOT NULL,
  "email" varchar(255),
  "custom_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "do_not_call" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "contacts_workspace_phone_unique" UNIQUE("workspace_id", "phone")
);

CREATE INDEX IF NOT EXISTS "ix_contacts_workspace_created" ON "contacts" ("workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "contact_notes" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_contact_notes_contact_created" ON "contact_notes" ("contact_id", "created_at");

CREATE TABLE IF NOT EXISTS "contact_lists" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_contact_lists_workspace" ON "contact_lists" ("workspace_id");

CREATE TABLE IF NOT EXISTS "contact_list_members" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "list_id" varchar(36) NOT NULL REFERENCES "contact_lists"("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "contact_list_members_unique" UNIQUE("list_id", "contact_id")
);

CREATE INDEX IF NOT EXISTS "ix_contact_list_members_contact" ON "contact_list_members" ("contact_id");

CREATE TABLE IF NOT EXISTS "agents" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "system_prompt" text NOT NULL DEFAULT '',
  "first_message" text NOT NULL DEFAULT '',
  "model_provider" varchar(50) NOT NULL DEFAULT 'openai',
  "model" varchar(100) NOT NULL DEFAULT 'gpt-4o',
  "voice_provider" varchar(50) NOT NULL DEFAULT '11labs',
  "voice_id" varchar(255) NOT NULL DEFAULT '',
  "transcriber_provider" varchar(50) NOT NULL DEFAULT 'deepgram',
  "transcriber_language" varchar(10) NOT NULL DEFAULT 'en',
  "provider" varchar(20) NOT NULL DEFAULT 'vapi',
  "provider_assistant_id" varchar(64),
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_agents_workspace" ON "agents" ("workspace_id");

CREATE TABLE IF NOT EXISTS "phone_numbers" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL DEFAULT 'vapi',
  "provider_phone_number_id" varchar(64) NOT NULL,
  "number" varchar(32) NOT NULL,
  "name" varchar(255),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "phone_numbers_workspace_provider_unique" UNIQUE("workspace_id", "provider_phone_number_id")
);

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "agent_id" varchar(36) NOT NULL REFERENCES "agents"("id") ON DELETE RESTRICT,
  "phone_number_id" varchar(36) NOT NULL REFERENCES "phone_numbers"("id") ON DELETE RESTRICT,
  "contact_list_id" varchar(36) NOT NULL REFERENCES "contact_lists"("id") ON DELETE RESTRICT,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "launched_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "campaigns_status_check" CHECK ("status" in ('draft', 'running', 'paused', 'completed'))
);

CREATE INDEX IF NOT EXISTS "ix_campaigns_workspace" ON "campaigns" ("workspace_id");

CREATE TABLE IF NOT EXISTS "calls" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL DEFAULT 'vapi',
  "provider_call_id" varchar(64),
  "direction" varchar(10) NOT NULL DEFAULT 'outbound',
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "ended_reason" varchar(100),
  "contact_id" varchar(36) REFERENCES "contacts"("id") ON DELETE SET NULL,
  "campaign_id" varchar(36) REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "agent_id" varchar(36) REFERENCES "agents"("id") ON DELETE SET NULL,
  "phone_number_id" varchar(36) REFERENCES "phone_numbers"("id") ON DELETE SET NULL,
  "customer_number" varchar(32) NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "duration_seconds" integer,
  "recording_url" text,
  "transcript" text,
  "summary" text,
  "cost" numeric(10, 4),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "calls_provider_call_id_unique" UNIQUE("provider_call_id"),
  CONSTRAINT "calls_direction_check" CHECK ("direction" in ('outbound', 'inbound')),
  CONSTRAINT "calls_status_check" CHECK ("status" in ('queued', 'ringing', 'in_progress', 'ended', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_calls_workspace_created" ON "calls" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_calls_campaign" ON "calls" ("campaign_id");
CREATE INDEX IF NOT EXISTS "ix_calls_contact" ON "calls" ("contact_id");

CREATE TABLE IF NOT EXISTS "campaign_recipients" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "campaign_id" varchar(36) NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "call_id" varchar(36) REFERENCES "calls"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "campaign_recipients_unique" UNIQUE("campaign_id", "contact_id"),
  CONSTRAINT "campaign_recipients_status_check" CHECK ("status" in ('pending', 'calling', 'completed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "ix_campaign_recipients_campaign_status" ON "campaign_recipients" ("campaign_id", "status");
