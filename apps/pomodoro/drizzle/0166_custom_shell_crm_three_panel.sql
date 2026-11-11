-- The CRM dashboard in the Admin 3 panel design (Tyler, 7 Nov 2026,
-- workspace/tasks/features/crm/36-crm-admin-3-panel.md). Four things, all new:
-- no existing row changes meaning.
--
-- 1. A conversation can be saved, once for the whole site: the Saved tab.
-- 2. A conversation remembers which address its mail arrived at, so the reply
--    goes back out from that same address. Null for the conversations that
--    came before, which reply from the first address on the list.
-- 3. The addresses mail arrives at, as a list. The single
--    email_settings.inbound_address is copied in as each site's first row and
--    left where it is; nothing is renamed.
-- 4. The left panel's page, one per site, with its cover and its lock.

ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "saved_at" timestamp with time zone;
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "to_address" varchar(255);

-- The Saved tab's own question: a handful of rows out of a table that only grows.
CREATE INDEX IF NOT EXISTS "ix_crm_threads_workspace_saved"
  ON "crm_threads" ("workspace_id", "last_message_at")
  WHERE "saved_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "crm_inbound_addresses" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "address" varchar(255) NOT NULL,
  "label" varchar(80) NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL
);

-- Lowered: mail arrives with whatever capitals the sender's client used.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_crm_inbound_addresses_workspace_address"
  ON "crm_inbound_addresses" ("workspace_id", lower("address"));

INSERT INTO "crm_inbound_addresses" ("id", "workspace_id", "address", "label", "created_at")
SELECT gen_random_uuid()::text, "workspace_id", trim("inbound_address"), '', now()
FROM "email_settings"
WHERE "inbound_address" IS NOT NULL AND trim("inbound_address") <> ''
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "crm_pages" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "locked" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL
);
