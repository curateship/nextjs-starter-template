ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "workspace_id" varchar(36);

UPDATE "media"
SET "workspace_id" = "workspaces"."id"
FROM "workspaces"
WHERE "media"."user_id" = "workspaces"."user_id"
  AND "workspaces"."is_default" = true
  AND "media"."workspace_id" IS NULL;

ALTER TABLE "media"
  ALTER COLUMN "workspace_id" SET NOT NULL;

ALTER TABLE "media"
  ADD CONSTRAINT "media_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "ix_media_workspace_id" ON "media" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ix_media_workspace_type_created" ON "media" ("workspace_id", "file_type", "created_at");

CREATE TABLE IF NOT EXISTS "generations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "module_key" varchar(100) NOT NULL,
  "provider" varchar(50) NOT NULL,
  "model" varchar(255) NOT NULL,
  "status" varchar(50) NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prompt" text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provider_task_id" varchar(255),
  "provider_result_url" text,
  "storage_path" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "generations_status_check"
    CHECK ("status" in ('draft', 'queued', 'writing_prompt', 'generating', 'saving', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_generations_user_id" ON "generations" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_generations_workspace_id" ON "generations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ix_generations_status" ON "generations" ("status");
CREATE INDEX IF NOT EXISTS "ix_generations_workspace_created" ON "generations" ("workspace_id", "created_at");
