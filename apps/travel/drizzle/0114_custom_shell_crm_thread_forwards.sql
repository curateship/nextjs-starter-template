-- Forward a conversation (CRM task 20, built in task 36, 7 Nov 2026): who it
-- was sent on to, when, and the note that went with it. The customer's
-- conversation shows each one as a quiet line. One conversation can be
-- forwarded more than once, so a table of its own. A new table, so no
-- existing row changes.
CREATE TABLE IF NOT EXISTS "crm_thread_forwards" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" varchar(36) NOT NULL REFERENCES "crm_threads"("id") ON DELETE CASCADE,
  "to_email" varchar(255) NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "forwarded_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_crm_thread_forwards_thread" ON "crm_thread_forwards" ("thread_id", "created_at");
