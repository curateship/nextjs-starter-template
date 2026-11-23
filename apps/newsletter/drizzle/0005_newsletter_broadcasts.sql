CREATE TABLE IF NOT EXISTS "newsletter_broadcasts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "preheader" text DEFAULT '' NOT NULL,
  "from_name" varchar(255),
  "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rendered_html" text,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "drip_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scheduled_at" timestamp with time zone,
  "next_batch_at" timestamp with time zone,
  "batches_sent" integer DEFAULT 0 NOT NULL,
  "paused_reason" text,
  "total_recipients" integer DEFAULT 0 NOT NULL,
  "total_sent" integer DEFAULT 0 NOT NULL,
  "total_failed" integer DEFAULT 0 NOT NULL,
  "sent_at" timestamp with time zone,
  "claim_token" varchar(36),
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "newsletter_broadcasts_status_check"
    CHECK ("status" in ('draft', 'scheduled', 'sending', 'paused', 'sent'))
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_broadcasts_workspace_status"
  ON "newsletter_broadcasts" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "ix_newsletter_broadcasts_status_next_batch"
  ON "newsletter_broadcasts" ("status", "next_batch_at");

CREATE TABLE IF NOT EXISTS "newsletter_broadcast_templates" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_newsletter_broadcast_templates_workspace"
  ON "newsletter_broadcast_templates" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_newsletter_broadcast_templates_default"
  ON "newsletter_broadcast_templates" ("workspace_id") WHERE "is_default";

ALTER TABLE "newsletter_deliveries"
  ADD COLUMN IF NOT EXISTS "broadcast_id" varchar(36)
    REFERENCES "newsletter_broadcasts"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_newsletter_deliveries_broadcast"
  ON "newsletter_deliveries" ("broadcast_id");
-- Exactly-one-send guard per (broadcast, contact), covering failed attempts too.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_newsletter_deliveries_broadcast_contact"
  ON "newsletter_deliveries" ("broadcast_id", "contact_id")
  WHERE "broadcast_id" IS NOT NULL;
