-- A reply written now and sent later (CRM task 38, part 6; Tyler picked "Send
-- a reply later" on 25 Nov 2026). The background pass sends each one at its
-- time through the same path as a reply sent now. `state` is waiting until
-- the pass claims it, sending while it goes, and failed when it could not go,
-- with the reason in `error`; a sent one is deleted, because the message it
-- became is the record. A new table, so no existing row changes.
CREATE TABLE IF NOT EXISTS "crm_scheduled_replies" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" varchar(36) NOT NULL REFERENCES "crm_threads"("id") ON DELETE CASCADE,
  "scheduled_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "files" jsonb NOT NULL DEFAULT '{"urls":[],"uploads":[]}'::jsonb,
  "send_at" timestamp with time zone NOT NULL,
  "state" varchar(16) NOT NULL DEFAULT 'waiting',
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_scheduled_replies_state_check" CHECK ("state" IN ('waiting', 'sending', 'failed'))
);

-- The pass asks for waiting replies whose time has come, oldest first.
CREATE INDEX IF NOT EXISTS "ix_crm_scheduled_replies_due"
  ON "crm_scheduled_replies" ("send_at") WHERE "state" = 'waiting';
CREATE INDEX IF NOT EXISTS "ix_crm_scheduled_replies_thread" ON "crm_scheduled_replies" ("thread_id");
