-- A half-written CRM reply survives a reload (CRM task 38, part 5; Tyler
-- picked "Draft survives a reload" on 25 Nov 2026). One row per conversation
-- per admin, so two admins typing in one conversation each keep their own.
-- An empty box is no row. The background pass removes rows untouched for 30
-- days. A new table, so no existing row changes.
CREATE TABLE IF NOT EXISTS "crm_reply_drafts" (
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" varchar(36) NOT NULL REFERENCES "crm_threads"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_reply_drafts_pk" PRIMARY KEY ("thread_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_crm_reply_drafts_user" ON "crm_reply_drafts" ("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "ix_crm_reply_drafts_updated" ON "crm_reply_drafts" ("updated_at");
