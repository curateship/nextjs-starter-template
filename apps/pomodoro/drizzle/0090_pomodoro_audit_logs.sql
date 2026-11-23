-- Who did what, for every privileged act in the app. Room moderation
-- (delete a message, remove a member, ban a member) writes here in the same
-- transaction as the act itself; the admin sections will write here too.
CREATE TABLE IF NOT EXISTS "pomodoro_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" varchar(36) NOT NULL,
  "action" varchar(40) NOT NULL,
  "resource" varchar(30) NOT NULL,
  "record_ids" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pomodoro_audit_logs_actor_created_idx"
  ON "pomodoro_audit_logs" ("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pomodoro_audit_logs_resource_created_idx"
  ON "pomodoro_audit_logs" ("resource", "created_at");
