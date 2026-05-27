CREATE TABLE IF NOT EXISTS "public_directories" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "source_result_id" varchar(36) REFERENCES "provider_results"("id") ON DELETE set null,
  "slug" varchar(100) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "title" varchar(255) NOT NULL,
  "meta_description" text,
  "featured_image" text,
  "public_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "public_directories_status_check" CHECK ("status" in ('draft', 'published'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_directories_workspace_slug_unique"
  ON "public_directories" ("workspace_id", "slug");

CREATE INDEX IF NOT EXISTS "ix_public_directories_workspace_status_slug"
  ON "public_directories" ("workspace_id", "status", "slug");

CREATE INDEX IF NOT EXISTS "ix_public_directories_workspace_updated"
  ON "public_directories" ("workspace_id", "updated_at");

CREATE UNIQUE INDEX IF NOT EXISTS "public_directories_source_result_id_unique"
  ON "public_directories" ("source_result_id");
