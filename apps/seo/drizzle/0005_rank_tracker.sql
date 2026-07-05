ALTER TABLE "project_keywords" ADD COLUMN IF NOT EXISTS "tracked_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "keyword_rankings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
  "position" integer,
  "ranking_url" text,
  "ranking_title" text,
  "top_results" jsonb,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_keyword_rankings_project_keyword_checked"
  ON "keyword_rankings" ("project_id", "keyword_id", "checked_at" DESC);

-- The SEO sidebar section is owned authoritatively by migration 0007.
