CREATE TABLE IF NOT EXISTS "keyword_clusters" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "anchor" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_keyword_clusters_project_id" ON "keyword_clusters" ("project_id");

ALTER TABLE "project_keywords" ADD COLUMN IF NOT EXISTS "cluster_id" varchar(36) REFERENCES "keyword_clusters"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_project_keywords_project_cluster" ON "project_keywords" ("project_id", "cluster_id");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "schedule_frequency" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "schedule_last_run_at" timestamp with time zone;
